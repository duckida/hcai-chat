import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { modelsStore, resetModels } from "@/stores/models";
import ThinkingPicker from "../ThinkingPicker";

const MODEL = "openai/gpt-4o";

/** Seed the catalog's reasoning metadata for the model under test. */
const seed = (reasoning) =>
  modelsStore.setState({ reasoningByModel: { [MODEL]: reasoning } });

const trigger = (label) =>
  screen.getByRole("button", { name: `Thinking level: ${label}` });

const openPicker = async (user, label) => {
  await user.click(trigger(label));
  return screen.findByRole("menu");
};

const items = (menu) =>
  within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);

beforeEach(() => {
  resetModels();
});

describe("ThinkingPicker", () => {
  it("offers the model's own efforts, least first, with off when it is allowed", async () => {
    const user = userEvent.setup();
    seed({
      mandatory: false,
      supported_efforts: ["max", "xhigh", "high", "medium", "low"],
      default_effort: "high",
    });
    render(<ThinkingPicker modelId={MODEL} value="high" onChange={vi.fn()} />);

    const menu = await openPicker(user, "High");
    expect(items(menu)).toEqual(["Off", "Low", "Medium", "High", "Extra high", "Max"]);
  });

  it("leaves out the off switch for a model that cannot be switched off", async () => {
    const user = userEvent.setup();
    seed({
      mandatory: true,
      supported_efforts: ["high", "medium", "low"],
      default_effort: "medium",
    });
    render(<ThinkingPicker modelId={MODEL} value="low" onChange={vi.fn()} />);

    const menu = await openPicker(user, "Low");
    expect(items(menu)).toEqual(["Low", "Medium", "High"]);
  });

  it("offers on/off for a model with no effort selection", async () => {
    const user = userEvent.setup();
    seed({ mandatory: false, default_enabled: true });
    render(<ThinkingPicker modelId={MODEL} value="off" onChange={vi.fn()} />);

    const menu = await openPicker(user, "Off");
    expect(items(menu)).toEqual(["Off", "Default"]);
  });

  it("reports the chosen level", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    seed({
      mandatory: false,
      supported_efforts: ["xhigh", "high", "medium", "low"],
      default_effort: "medium",
    });
    render(<ThinkingPicker modelId={MODEL} value="medium" onChange={onChange} />);

    const menu = await openPicker(user, "Medium");
    await user.click(within(menu).getByText("Extra high"));
    expect(onChange).toHaveBeenCalledWith("xhigh");
  });

  it("shows the level that will actually be sent when the model does not take it", async () => {
    // The stored level is global and the model is not: the picker must name and
    // check the resolved one, not the stored one.
    const user = userEvent.setup();
    seed({
      mandatory: true,
      supported_efforts: ["high", "medium", "low"],
      default_effort: "medium",
    });
    render(<ThinkingPicker modelId={MODEL} value="off" onChange={vi.fn()} />);

    const menu = await openPicker(user, "Medium");
    const selected = within(menu).getByRole("menuitem", { name: /Medium/ });
    expect(selected.querySelector("svg")).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: /High/ }).querySelector("svg"),
    ).not.toBeInTheDocument();
  });

  it("gives a model that cannot reason no menu at all", async () => {
    const user = userEvent.setup();
    seed(null);
    render(<ThinkingPicker modelId={MODEL} value="high" onChange={vi.fn()} />);

    const disabled = screen.getByRole("button", {
      name: "Thinking not supported by current model",
    });
    expect(disabled).toBeDisabled();

    await user.click(disabled);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps the control alive for a model the catalog does not know yet", async () => {
    // Before the catalog loads every model id is unknown; an empty or absent
    // control there would read as "thinking is unsupported".
    const user = userEvent.setup();
    render(<ThinkingPicker modelId="nobody/unknown" value="medium" onChange={vi.fn()} />);

    const menu = await openPicker(user, "Medium");
    expect(items(menu)).toEqual(["Off", "Low", "Medium", "High"]);
  });

  it("falls back to a known level when handed one it does not have", async () => {
    // A hand-edited storage value must not leave the picker with no label and
    // no selected item.
    const user = userEvent.setup();
    seed({ mandatory: false, default_enabled: true });
    render(<ThinkingPicker modelId={MODEL} value="galaxy-brain" onChange={vi.fn()} />);

    const menu = await openPicker(user, "Default");
    expect(items(menu)).toEqual(["Off", "Default"]);
  });
});
