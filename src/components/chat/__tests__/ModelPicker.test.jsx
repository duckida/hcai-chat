import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { modelsStore, resetModels } from "@/stores/models";
import { hydrateSettings, resetSettings } from "@/stores/settings";
import ModelPicker from "../ModelPicker";

const GROUPED = {
  OpenAI: [{ id: "openai/gpt-4o", name: "GPT-4o" }],
  Google: [{ id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1" }],
};

const seed = (grouped = GROUPED) =>
  modelsStore.setState({ grouped, status: "ready" });

// Every row's star carries its model name too ("Add GPT-4o to favorites"), so
// matching the trigger by name alone becomes ambiguous once a menu is open.
// The trigger is the button wired to the popup instead.
const trigger = () =>
  screen
    .getAllByRole("button", { name: /GPT-4o|Select Model/, hidden: true })
    .find((button) => button.getAttribute("aria-haspopup") === "true");

const openPicker = async (user) => {
  await user.click(trigger());
  return screen.findByRole("menu");
};

beforeEach(() => {
  resetModels();
  resetSettings();
  localStorage.clear();
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
    expect(selected.querySelector("svg.lucide-check")).toBeInTheDocument();
    expect(other.querySelector("svg.lucide-check")).not.toBeInTheDocument();
  });

  it("offers a star for every model", async () => {
    const user = userEvent.setup();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);

    const menu = await openPicker(user);
    expect(
      within(menu).getByRole("button", { name: "Add GPT-4o to favorites" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("button", {
        name: "Add Gemini 3.1 to favorites",
      }),
    ).toBeInTheDocument();
  });

  it("stars a model without selecting it and shows it in a favorites group at the top", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={onChange} />);

    const menu = await openPicker(user);
    await user.click(
      within(menu).getByRole("button", { name: "Add Gemini 3.1 to favorites" }),
    );

    // Starring must not double as choosing the model, or the picker's whole
    // point — pick a favorite, then pick it — would collapse into one action.
    expect(onChange).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem("favorite_models")),
    ).toEqual(["google/gemini-3.1-flash-lite"]);
    expect(within(menu).getByText("Favorites")).toBeInTheDocument();
    // Grouped providers sort Google before OpenAI, so a first-row favorite
    // can only be the top group.
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveTextContent(
      "Gemini 3.1",
    );
  });

  it("unstars from the favorites row and drops the group when it empties", async () => {
    const user = userEvent.setup();
    localStorage.setItem("favorite_models", JSON.stringify(["openai/gpt-4o"]));
    hydrateSettings();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);

    const menu = await openPicker(user);
    expect(within(menu).getByText("Favorites")).toBeInTheDocument();

    await user.click(
      within(menu).getAllByRole("button", {
        name: "Remove GPT-4o from favorites",
      })[0],
    );

    expect(JSON.parse(localStorage.getItem("favorite_models"))).toEqual([]);
    expect(within(menu).queryByText("Favorites")).toBeNull();
  });

  it("lists a starred model once instead of its whole provider group", async () => {
    const user = userEvent.setup();
    seed({
      OpenAI: [
        { id: "openai/gpt-4o", name: "GPT-4o" },
        { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
        { id: "openai/o3", name: "o3" },
      ],
    });
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);

    const menu = await openPicker(user);
    await user.click(
      within(menu).getByRole("button", { name: "Add GPT-4o mini to favorites" }),
    );

    // A starred row is a second copy of a model, so it has to carry its own
    // collection id: reusing the model id let React Aria's key map overwrite
    // the provider's node, and the Favorites section then walked that node's
    // sibling chain and rendered all three OpenAI models.
    const favorites = within(menu)
      .getByText("Favorites")
      .closest('[data-slot="menu-group"]');
    expect(within(favorites).getAllByRole("menuitem")).toHaveLength(1);
    expect(within(favorites).getByText("GPT-4o mini")).toBeInTheDocument();
    expect(within(favorites).queryByText("o3")).toBeNull();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
  });

  it("selects the real model id from a favorites row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={onChange} />);

    const menu = await openPicker(user);
    await user.click(
      within(menu).getByRole("button", { name: "Add Gemini 3.1 to favorites" }),
    );
    await user.click(within(menu).getAllByRole("menuitem")[0]);

    expect(onChange).toHaveBeenCalledWith("google/gemini-3.1-flash-lite");
  });

  it("keeps the trigger in the accessibility tree while the menu is open", async () => {
    const user = userEvent.setup();
    seed();
    render(<ModelPicker value="openai/gpt-4o" onChange={vi.fn()} />);

    await user.click(trigger());
    await screen.findByRole("menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
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
