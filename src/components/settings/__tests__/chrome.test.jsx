import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SwitchRow } from "../chrome";

describe("SwitchRow", () => {
  it("names the switch after its visible label", () => {
    render(
      <SwitchRow
        id="show-thinking"
        label="Show Thinking"
        description="Expand thinking blocks by default."
        checked
        onChange={vi.fn()}
      />,
    );

    // A `<label for>` cannot name a `<button>`: labels only associate with
    // labelable form controls, so without `aria-labelledby` every toggle in
    // Settings announced as "switch, on" with nothing saying what it switches.
    // React says so too — but only for React Aria controls, so this plain
    // button is invisible to the smoke script's console check, which is why
    // the association is pinned here instead.
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-labelledby", "show-thinking-label");
    expect(screen.getByText("Show Thinking")).toHaveAttribute(
      "id",
      "show-thinking-label",
    );
    expect(toggle).toHaveAccessibleName("Show Thinking");
  });

  it("describes the switch with the row's description", () => {
    render(
      <SwitchRow
        id="show-metrics"
        label="Show Response Metrics"
        description="Display token count and timing info."
        checked={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("switch")).toHaveAccessibleDescription(
      "Display token count and timing info.",
    );
  });

  it("still toggles through the row's onChange", () => {
    const onChange = vi.fn();
    render(
      <SwitchRow
        id="toggle"
        label="Toggle"
        description="A row."
        checked={false}
        onChange={onChange}
      />,
    );

    screen.getByRole("switch").click();
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
