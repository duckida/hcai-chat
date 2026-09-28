import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { modelsStore, resetModels } from "@/stores/models";
import ModelPicker from "../ModelPicker";

const GROUPED = {
  OpenAI: [{ id: "openai/gpt-4o", name: "GPT-4o" }],
  Google: [{ id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1" }],
};

const seed = (grouped = GROUPED) =>
  modelsStore.setState({ grouped, status: "ready" });

const trigger = () => screen.getByRole("button", { name: /GPT-4o|Select Model/ });

const openPicker = async (user) => {
  await user.click(trigger());
  return screen.findByRole("menu");
};

beforeEach(() => {
  resetModels();
});

describe("ModelPicker", () => {
  it("shows the selected model's display name on the trigger", () => {
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);
    expect(trigger()).toHaveTextContent("GPT-4o");
  });

  it("falls back to the empty label when the model is not in the catalog", () => {
    seed();
    render(
      <ModelPicker value="missing/model" onChange={vi.fn()} emptyLabel="Select Model" />,
    );
    expect(screen.getByRole("button", { name: /Select Model/ })).toBeInTheDocument();
  });

  it("lists every provider group with its models when opened", async () => {
    const user = userEvent.setup();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);

    const menu = await openPicker(user);
    expect(within(menu).getByText("OpenAI")).toBeInTheDocument();
    expect(within(menu).getByText("Google")).toBeInTheDocument();
    expect(within(menu).getByText("GPT-4o")).toBeInTheDocument();
    expect(within(menu).getByText("Gemini 3.1")).toBeInTheDocument();
  });

  it("reports the chosen model id", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={onChange} />);

    const menu = await openPicker(user);
    await user.click(within(menu).getByText("Gemini 3.1"));
    expect(onChange).toHaveBeenCalledWith("google/gemini-3.1-flash-lite");
  });

  it("marks only the selected model with a check", async () => {
    const user = userEvent.setup();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);

    const menu = await openPicker(user);
    const selected = within(menu).getByRole("menuitem", { name: /GPT-4o/ });
    const other = within(menu).getByRole("menuitem", { name: /Gemini 3.1/ });
    expect(selected.querySelector("svg")).toBeInTheDocument();
    expect(other.querySelector("svg")).not.toBeInTheDocument();
  });

  it("keeps the trigger in the accessibility tree while the menu is open", async () => {
    const user = userEvent.setup();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);

    await user.click(trigger());
    await screen.findByRole("menu");
    expect(
      screen.getByRole("button", { name: /GPT-4o/, hidden: true }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("restores the trigger to the accessibility tree after closing", async () => {
    const user = userEvent.setup();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);

    await openPicker(user);
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /GPT-4o/ }),
      ).toHaveAttribute("aria-expanded", "false"),
    );
  });

  it("shows a loading row while the catalog is empty", async () => {
    const user = userEvent.setup();
    render(
      <ModelPicker
        value="openai/gpt-4o"
        onChange={vi.fn()}
        emptyLabel="Select Model"
      />,
    );

    const menu = await openPicker(user);
    expect(within(menu).getByText("Loading models...")).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /GPT-4o/ })).toBeNull();
  });
});
