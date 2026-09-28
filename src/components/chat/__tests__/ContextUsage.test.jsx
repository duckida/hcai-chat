import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

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
