import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { parseInlineViewSpec } from "@/lib/inline-view-catalog";
import JsonInlineView from "../JsonInlineView";

function renderSpec(elements, state = {}, root = "root") {
  const spec = parseInlineViewSpec(JSON.stringify({ root, elements, state }));
  expect(spec).not.toBeNull();
  return render(<JsonInlineView spec={spec} />);
}

function renderElement(type, props) {
  return renderSpec({ root: { type, props } });
}

describe("JSON inline views", () => {
  it("uses app surfaces, typography, spacing and container-width grids", () => {
    const view = renderSpec({
      root: { type: "Grid", props: { columns: 6 }, children: ["card", "metric"] },
      card: { type: "Card", props: { title: "Results", variant: "accent" }, children: ["heading", "text"] },
      heading: { type: "Heading", props: { text: "Overview", level: "h1" } },
      text: { type: "Text", props: { text: "A useful summary", variant: "lead" } },
      metric: { type: "Metric", props: { label: "Users", value: 1234, unit: "people", trend: { value: "12%", direction: "up", sentiment: "positive", label: "vs last month" } } },
    });

    const root = view.container.firstElementChild;
    expect(root.className).toContain("@container/inline");
    expect(root.className).toContain("font-sans");
    expect(root.firstElementChild.className).toContain("@[600px]/inline:grid-cols-6");
    expect(root.firstElementChild.className).not.toContain("sm:grid-cols");
    expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toHaveClass("text-2xl");
    expect(screen.getByText("Results").closest(".rounded-2xl")).toHaveClass("border-primary/20", "bg-primary/5");
    expect(screen.getByText("A useful summary")).toHaveClass("text-[15px]");
    expect(screen.getByText("1,234")).toHaveClass("tabular-nums");
    expect(screen.getByText("12%").closest("span")).toHaveClass("text-emerald-700");
    expect(screen.getByText("vs last month")).toBeInTheDocument();
  });

  it("switches tabs by keyboard, binds selection locally and preserves inactive controls", async () => {
    const user = userEvent.setup();
    const view = renderSpec({
      root: { type: "Stack", props: {}, children: ["tabs", "selected"] },
      tabs: { type: "Tabs", props: { label: "Report", tabs: [{ label: "Overview", value: "overview" }, { label: "Details", value: "details" }], value: { $bindState: "/tab" } }, children: ["overview", "details"] },
      overview: { type: "TabContent", props: { value: "overview" }, children: ["input"] },
      details: { type: "TabContent", props: { value: "details" }, children: ["detail"] },
      input: { type: "Input", props: { label: "Name" } },
      detail: { type: "Text", props: { text: "Detailed content" } },
      selected: { type: "Text", props: { text: { $template: "Selected: ${/tab}" } } },
    }, { tab: "overview" });

    expect(screen.getByRole("tablist", { name: "Report" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Ada");
    act(() => screen.getByRole("tab", { name: "Overview" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Selected: details")).toBeInTheDocument();
    const detailsPanel = screen.getByRole("tabpanel", { name: "Details" });
    expect(detailsPanel).toHaveTextContent("Detailed content");
    const hidden = view.container.querySelector("[data-inert='true']");
    expect(hidden).toHaveAttribute("inert");
    expect(hidden.className).toContain("data-inert:hidden");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Ada");
  });

  it("expands a labeled accordion and mirrors its bound state", async () => {
    const user = userEvent.setup();
    renderSpec({
      root: { type: "Stack", props: {}, children: ["accordion", "state"] },
      accordion: { type: "Accordion", props: { title: "How it works", expanded: { $bindState: "/open" } }, children: ["text"] },
      text: { type: "Text", props: { text: "An expanded explanation" } },
      state: { type: "Text", props: { text: { $cond: { $state: "/open" }, $then: "Open", $else: "Closed" } } },
    }, { open: false });

    expect(screen.getByRole("button", { name: "How it works" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "How it works" }));
    expect(screen.getByRole("button", { name: "How it works" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("An expanded explanation")).toBeVisible();
    expect(screen.getByText("Open")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "How it works" }));
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it.each(["Quiz", "InteractiveQuiz"])("checks and retries an interactive %s", async (type) => {
    const user = userEvent.setup();
    renderElement(type, {
      question: "Which is prime?",
      options: [{ label: "Four", value: "four" }, { label: "Five", value: "five" }],
      answer: "five",
      explanation: "Five has only two divisors.",
    });

    expect(screen.getByRole("radiogroup", { name: "Which is prime?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check answer" })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Four" }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    expect(screen.getByRole("status")).toHaveTextContent("Not quite.");
    expect(screen.getByRole("status")).toHaveTextContent("Five has only two divisors.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Four" })).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Five" }));
    await user.click(screen.getByRole("button", { name: "Check answer" }));
    expect(screen.getByRole("status")).toHaveTextContent("Correct!");
  });

  it("renders the added data, navigation and loading components", () => {
    renderSpec({
      root: { type: "Stack", props: {}, children: ["separator", "badge", "timeline", "progress", "callout", "link", "skeleton", "table"] },
      separator: { type: "Separator", props: { label: "Milestones" } },
      badge: { type: "Badge", props: { label: "Ready", variant: "success" } },
      timeline: { type: "Timeline", props: { title: "Release", items: [{ title: "Design", date: "Monday", status: "complete" }, { title: "Build", status: "current" }] } },
      progress: { type: "Progress", props: { label: "Completed", value: 25, max: 50 } },
      callout: { type: "Callout", props: { title: "Remember", text: "Save your work", variant: "tip" } },
      link: { type: "Link", props: { label: "Documentation", href: "https://example.com/docs", description: "Read the guide" } },
      skeleton: { type: "Skeleton", props: { label: "Loading details", lines: 2 } },
      table: { type: "Table", props: { columns: ["Name", "Value"], rows: [["Used", 25]], caption: "Summary" } },
    });

    expect(screen.getByText("Milestones")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toHaveClass("rounded-full", "text-emerald-700");
    const list = screen.getByRole("list");
    expect(list).toHaveClass("list-none");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Monday")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Completed" })).toHaveAttribute("value", "25");
    expect(screen.getByRole("progressbar", { name: "Completed" })).toHaveAttribute("max", "50");
    expect(screen.getByRole("complementary")).toHaveTextContent("Save your work");
    const link = screen.getByRole("link", { name: /Documentation/ });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const skeleton = screen.getByRole("status", { name: "Loading details" });
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton.querySelectorAll(".animate-hcai-shimmer")).toHaveLength(2);
    expect(screen.getByRole("table", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("scope", "col");
  });

  it("keeps the themed input, checkbox and slider bound to view-local state", async () => {
    const user = userEvent.setup();
    renderSpec({
      root: { type: "Stack", props: {}, children: ["input", "checkbox", "slider", "select", "output"] },
      input: { type: "Input", props: { label: "Name", value: { $bindState: "/name" } } },
      checkbox: { type: "Checkbox", props: { label: "Enabled", checked: { $bindState: "/enabled" } } },
      slider: { type: "Slider", props: { label: "Amount", min: 0, max: 10, value: { $bindState: "/amount" } } },
      select: { type: "Select", props: { label: "Mode", options: [{ label: "Fast", value: "fast" }, { label: "Slow", value: "slow" }], value: { $bindState: "/mode" } } },
      output: { type: "Text", props: { text: { $template: "${/name} / ${/enabled} / ${/amount}" } } },
    }, { name: "", enabled: false, amount: 3, mode: "fast" });

    expect(screen.getByRole("textbox", { name: "Name" })).toHaveAttribute("data-slot", "input");
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Ada");
    await user.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeChecked();
    act(() => screen.getByRole("slider", { name: "Amount" }).focus());
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("slider", { name: "Amount" })).toHaveValue("4");
    expect(screen.getByText("Ada / true / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mode/ })).toHaveTextContent("Fast");
  });

  it("rejects unsafe resolved props and recovers after a safe state change", () => {
    renderSpec({
      root: { type: "Stack", props: {}, children: ["text", "heading", "link", "button"] },
      text: { type: "Text", props: { text: { $state: "/invalidText" } } },
      heading: { type: "Heading", props: { text: "Never a script", level: { $state: "/invalidLevel" } } },
      link: { type: "Link", props: { label: "Dynamic docs", href: { $state: "/href" } } },
      button: { type: "Button", props: { label: "Use safe URL" }, on: { press: { action: "setState", params: { statePath: "/href", value: "https://example.com" } } } },
    }, { invalidText: { bad: "value" }, invalidLevel: "script", href: "javascript:alert(1)" });

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(screen.queryByText("Never a script")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use safe URL" }));
    expect(screen.getByRole("link", { name: /Dynamic docs/ })).toHaveAttribute("href", "https://example.com");
  });

  it("reflects a new resolved value in a control that was not two-way bound", () => {
    renderSpec({
      root: { type: "Stack", props: {}, children: ["input", "button"] },
      input: { type: "Input", props: { label: "Message", value: { $state: "/message" } } },
      button: { type: "Button", props: { label: "Update message" }, on: { press: { action: "setState", params: { statePath: "/message", value: "After" } } } },
    }, { message: "Before" });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Before");
    fireEvent.click(screen.getByRole("button", { name: "Update message" }));
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("After");
  });
});
