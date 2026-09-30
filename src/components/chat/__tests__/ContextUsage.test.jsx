import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { TOOLTIP_OPEN_DELAY } from "@/lib/tooltip";
import { modelsStore, resetModels } from "@/stores/models";
import ContextUsage from "../ContextUsage";

const seedWindow = (modelId, window) =>
  modelsStore.setState({
    contextWindows: { [modelId]: window },
    status: "ready",
  });

const ringStroke = (container) =>
  container.querySelectorAll("circle")[1].getAttribute("stroke");

beforeEach(() => {
  resetModels();
});

describe("ContextUsage", () => {
  it("renders nothing until the model's window is known", () => {
    render(<ContextUsage used={500} modelId="unknown/model" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("resolves the window from the model catalog", () => {
    seedWindow("openai/gpt-4o", 1000);
    render(<ContextUsage used={250} modelId="openai/gpt-4o" />);
    expect(
      screen.getByRole("button", {
        name: "Context usage: 25% used, 250 of 1,000",
      }),
    ).toBeInTheDocument();
  });

  it("renders no ring when no model is selected", () => {
    seedWindow("openai/gpt-4o", 1000);
    render(<ContextUsage used={250} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("clamps the ratio when usage exceeds the window", () => {
    seedWindow("openai/gpt-4o", 1000);
    render(<ContextUsage used={5000} modelId="openai/gpt-4o" />);
    expect(
      screen.getByRole("button", {
        name: "Context usage: 100% used, 5,000 of 1,000",
      }),
    ).toBeInTheDocument();
  });

  it("reports the exact token count and percentage in the tooltip", async () => {
    const user = userEvent.setup();
    seedWindow("openai/gpt-4o", 2000);
    render(<ContextUsage used={400} modelId="openai/gpt-4o" />);

    await user.hover(screen.getByRole("button"));

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("20% used")).toBeInTheDocument();
    expect(within(tooltip).getByText("400 out of 2,000")).toBeInTheDocument();
  });

  it("shows the cost only when there is one", async () => {
    const user = userEvent.setup();
    seedWindow("openai/gpt-4o", 1000);
    const { rerender } = render(
      <ContextUsage used={100} modelId="openai/gpt-4o" totalCost={0.5} />,
    );
    await user.hover(screen.getByRole("button"));
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Cost: $0.50")).toBeInTheDocument();

    rerender(<ContextUsage used={100} modelId="openai/gpt-4o" totalCost={0} />);
    expect(within(tooltip).queryByText(/Cost:/)).not.toBeInTheDocument();
  });

  // Radix keeps a visually-hidden span with the tooltip text for assistive
  // tech, present whether or not the tooltip is showing, so presence of
  // role="tooltip" says nothing about visibility. The trigger's data-state is
  // what actually moves.
  const isShowing = () =>
    ["delayed-open", "instant-open", "open"].includes(
      screen.getByRole("button").getAttribute("data-state"),
    );

  it("waits for the pointer to rest before opening", async () => {
    // The ring sits in a header the cursor crosses on the way to the composer.
    // An instant tooltip covers the conversation; the delay is the fix.
    const user = userEvent.setup();
    seedWindow("openai/gpt-4o", 2000);
    render(<ContextUsage used={400} modelId="openai/gpt-4o" />);

    await user.hover(screen.getByRole("button"));

    expect(isShowing()).toBe(false);
    await waitFor(() => {
      expect(isShowing()).toBe(true);
    });
  });

  it("cancels the pending open when the pointer leaves first", async () => {
    const user = userEvent.setup();
    seedWindow("openai/gpt-4o", 2000);
    render(<ContextUsage used={400} modelId="openai/gpt-4o" />);

    await user.hover(screen.getByRole("button"));
    await user.unhover(screen.getByRole("button"));
    await new Promise((r) => setTimeout(r, TOOLTIP_OPEN_DELAY + 150));

    expect(isShowing()).toBe(false);
  });

  it("opens beside the ring rather than over the conversation", async () => {
    // Anchored below, the panel lands on the first message the user came to
    // read. The ring is at the top of the screen, so it opens sideways.
    const user = userEvent.setup();
    seedWindow("openai/gpt-4o", 2000);
    render(<ContextUsage used={400} modelId="openai/gpt-4o" />);

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(document.querySelector("[data-side]")).not.toBeNull();
    });
    expect(
      document.querySelector("[data-side]").getAttribute("data-side"),
    ).toBe("left");
  });

  it("keeps the ring neutral below 75%", () => {
    seedWindow("openai/gpt-4o", 1000);
    const { container } = render(
      <ContextUsage used={740} modelId="openai/gpt-4o" />,
    );
    expect(ringStroke(container)).toBe("var(--foreground)");
  });

  it("turns the ring amber at 75% and red at 90%", () => {
    seedWindow("openai/gpt-4o", 1000);

    const { container: at75 } = render(
      <ContextUsage used={750} modelId="openai/gpt-4o" />,
    );
    expect(ringStroke(at75)).toBe("#f59e0b");

    const { container: at90 } = render(
      <ContextUsage used={900} modelId="openai/gpt-4o" />,
    );
    expect(ringStroke(at90)).toBe("#ef4444");
  });
});
