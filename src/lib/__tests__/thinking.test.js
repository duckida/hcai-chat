import { describe, expect, it } from "vitest";

import {
  DEFAULT_THINKING_LEVEL,
  isThinkingLevel,
  isThinkingOn,
  reasoningParamsFor,
  resolveThinkingLevel,
  THINKING_EFFORTS,
  thinkingLevelLabel,
  thinkingOptionsFor,
} from "../thinking";

/** The catalog entry for a model, in the shape `/api/models` reports it. */
const reasoning = (overrides = {}) => ({ mandatory: false, ...overrides });

const values = (model) => thinkingOptionsFor(model).map((option) => option.value);

describe("thinking controls", () => {
  it("orders the effort vocabulary least to most", () => {
    expect(THINKING_EFFORTS).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("recognises the control values and nothing else", () => {
    for (const value of ["off", "on", ...THINKING_EFFORTS]) {
      expect(isThinkingLevel(value)).toBe(true);
    }
    for (const value of [true, false, "none", "galaxy-brain", null, undefined]) {
      expect(isThinkingLevel(value)).toBe(false);
    }
  });

  it("treats every value but off as reasoning", () => {
    expect(isThinkingOn("off")).toBe(false);
    expect(isThinkingOn("on")).toBe(true);
    expect(isThinkingOn("xhigh")).toBe(true);
  });

  it("labels a known value and falls back for an unknown one", () => {
    expect(thinkingLevelLabel("low")).toBe("Low");
    expect(thinkingLevelLabel("on")).toBe("Default");
    expect(thinkingLevelLabel("galaxy-brain")).toBe(
      thinkingLevelLabel(DEFAULT_THINKING_LEVEL),
    );
  });
});

describe("thinkingOptionsFor", () => {
  it("offers the common ladder for a model the catalog does not know", () => {
    // The catalog may simply not have loaded; the control must not vanish or
    // show an empty menu in the meantime.
    expect(values(undefined)).toEqual(["off", "low", "medium", "high"]);
  });

  it("offers nothing for a model the catalog says cannot reason", () => {
    expect(values(null)).toEqual([]);
  });

  it("offers on/off when the model exposes no effort selection", () => {
    // `supported_efforts` omitted: reasoning itself is supported, the ladder
    // is not, so "enabled at the model's default" is the control.
    expect(values(reasoning({ default_enabled: true }))).toEqual(["off", "on"]);
  });

  it("hides the off switch when reasoning is mandatory", () => {
    expect(values(reasoning({ mandatory: true }))).toEqual(["on"]);
    expect(
      values(
        reasoning({
          mandatory: true,
          supported_efforts: ["high", "medium", "low"],
          default_effort: "medium",
        }),
      ),
    ).toEqual(["low", "medium", "high"]);
  });

  it("lists the model's own efforts, least first", () => {
    // The API returns them highest first; a menu reads better ascending, and
    // the order must come from the ladder rather than from the API's array.
    expect(
      values(
        reasoning({
          supported_efforts: ["max", "xhigh", "high", "medium", "low"],
          default_effort: "high",
        }),
      ),
    ).toEqual(["off", "low", "medium", "high", "xhigh", "max"]);
  });

  it("folds the effort named none into the off switch", () => {
    expect(
      values(
        reasoning({
          supported_efforts: ["high", "medium", "none"],
          default_effort: "high",
        }),
      ),
    ).toEqual(["off", "medium", "high"]);
  });

  it("offers the whole vocabulary when every effort is accepted", () => {
    expect(values(reasoning({ supported_efforts: null }))).toEqual([
      "off",
      ...THINKING_EFFORTS,
    ]);
  });

  it("keeps an effort the gateway adds later", () => {
    expect(
      values(reasoning({ supported_efforts: ["enormous", "high"] })),
    ).toEqual(["off", "high", "enormous"]);
  });
});

describe("resolveThinkingLevel", () => {
  it("passes a level the model offers straight through", () => {
    const model = reasoning({
      supported_efforts: ["high", "medium", "low"],
      default_effort: "medium",
    });
    expect(resolveThinkingLevel("high", model)).toBe("high");
    expect(resolveThinkingLevel("off", model)).toBe("off");
  });

  it("falls back to the model's own default effort otherwise", () => {
    const model = reasoning({
      supported_efforts: ["high", "medium", "low"],
      default_effort: "low",
    });
    expect(resolveThinkingLevel("max", model)).toBe("low");
  });

  it("does not switch an unsupported level off", () => {
    // The whole point of resolving: "max" on a model that has no ladder means
    // "reason hard", not "do not reason".
    expect(resolveThinkingLevel("max", reasoning({ default_enabled: true }))).toBe(
      "on",
    );
  });

  it("turns reasoning on for a mandatory model asked to switch off", () => {
    const model = reasoning({
      mandatory: true,
      supported_efforts: ["high", "medium", "low"],
      default_effort: "medium",
    });
    expect(resolveThinkingLevel("off", model)).toBe("medium");
  });

  it("asks for no reasoning from a model that cannot reason", () => {
    expect(resolveThinkingLevel("high", null)).toBe("off");
  });

  it("leaves a model the catalog does not know alone", () => {
    expect(resolveThinkingLevel("xhigh", undefined)).toBe("xhigh");
    expect(resolveThinkingLevel("galaxy-brain", undefined)).toBe(
      DEFAULT_THINKING_LEVEL,
    );
  });

  it("does not pre-select off because default_effort says none", () => {
    // "off by default" is not an effort to pre-select for a user who asked to
    // reason, and not a reason to drop the level they chose either.
    const model = reasoning({
      supported_efforts: ["high", "medium", "low", "none"],
      default_effort: "none",
    });
    expect(resolveThinkingLevel("off", model)).toBe("off");
    expect(resolveThinkingLevel("minimal", model)).toBe("medium");
    expect(resolveThinkingLevel("xhigh", model)).toBe("medium");
  });

  it("prefers the app default over an arbitrary first option", () => {
    // No default_effort, no ladder: the fallback still has to be a level, not
    // whichever entry happened to sort first.
    const model = reasoning({ supported_efforts: ["low", "minimal"] });
    expect(resolveThinkingLevel("max", model)).toBe("minimal");
  });
});

describe("reasoningParamsFor", () => {
  it("sends an effort for a level", () => {
    expect(reasoningParamsFor("medium")).toEqual({
      include_reasoning: true,
      reasoning: { effort: "medium", exclude: false },
    });
  });

  it("disables reasoning by switching it off, never by naming no effort", () => {
    // `effort: "none"` is rejected outright by some models; the enable flag is
    // the switch every provider understands.
    expect(reasoningParamsFor("off")).toEqual({
      include_reasoning: false,
      reasoning: { enabled: false, exclude: true },
    });
  });

  it("enables reasoning at the model's default for the on control", () => {
    expect(reasoningParamsFor("on")).toEqual({
      include_reasoning: true,
      reasoning: { enabled: true, exclude: false },
    });
  });

  it("never forwards a value that is not a control", () => {
    expect(reasoningParamsFor("galaxy-brain")).toEqual(
      reasoningParamsFor(DEFAULT_THINKING_LEVEL),
    );
    expect(reasoningParamsFor(undefined)).toEqual(
      reasoningParamsFor(DEFAULT_THINKING_LEVEL),
    );
  });
});
