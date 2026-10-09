/**
 * Thinking controls, driven by what each model actually accepts.
 *
 * OpenRouter normalises every provider's reasoning controls onto one
 * `reasoning` object, and `GET /api/v1/models` reports per model which of them
 * it takes:
 *
 *   reasoning: {
 *     mandatory: true,                            // cannot be turned off
 *     supported_efforts: ["high", "medium", "low"],// descending; null = any; omitted = no effort selection
 *     default_effort: "medium",                   // pre-select when enabling
 *     default_enabled: true,                      // state when the user has not chosen
 *     supports_max_tokens: true,                  // accepts a token budget instead of an effort
 *   }
 *
 * So a control value is one of three things, not a boolean:
 *
 *   "off"     reasoning disabled                      -> reasoning: { enabled: false }
 *   "on"      enabled at the model's own default      -> reasoning: { enabled: true }
 *   <effort>  one of the effort ladder                -> reasoning: { effort }
 *
 * Which of those a model may receive is decided here, from its catalog entry,
 * so the picker and the request cannot disagree about it. A model the catalog
 * does not know (the catalog has not loaded, or predates the field) keeps the
 * app's own default ladder rather than losing the control.
 *
 * Pure — the chat route imports this on the server, so no React or browser
 * globals in here.
 */

/** The gateway's effort vocabulary, least to most. */
export const THINKING_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export const THINKING_OFF = "off";
export const THINKING_ON = "on";

const LABELS = {
  off: "Off",
  on: "Default",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

/** The level used when nothing else decides: the app's own default. */
export const DEFAULT_THINKING_LEVEL = "medium";

// What an unknown model is offered. Deliberately the middle of the ladder
// rather than all six: these are the efforts every reasoning model has taken
// for as long as this app has had a toggle.
const FALLBACK_LEVELS = ["off", "low", "medium", "high"];

const EFFORT_ORDER = new Map(
  THINKING_EFFORTS.map((effort, index) => [effort, index]),
);

export function isThinkingLevel(value) {
  return (
    value === THINKING_OFF || value === THINKING_ON || EFFORT_ORDER.has(value)
  );
}

export function thinkingLevelLabel(value) {
  // An unknown value reads as the default level, label included: the picker
  // prints this, and a raw value on the button would name a level the menu
  // does not contain.
  return LABELS[value] ?? LABELS[DEFAULT_THINKING_LEVEL];
}

/**
 * Whether reasoning happens at all — the distinction the thread's display
 * gates care about, where "on" and every effort are the same answer.
 */
export function isThinkingOn(value) {
  return value !== THINKING_OFF;
}

/**
 * The efforts a model exposes, least to most, or `[]` when it does not expose
 * effort selection, or `null` when the catalog does not know the model.
 *
 * `supported_efforts: null` means the gateway accepts any effort, so the whole
 * vocabulary is offered; an omitted list means the model has no ladder and the
 * control is the on/off switch instead.
 */
function effortLadder(reasoning) {
  if (reasoning == null) return null;
  if (!("supported_efforts" in reasoning)) return [];
  const efforts = reasoning.supported_efforts;
  if (!Array.isArray(efforts)) return [...THINKING_EFFORTS];
  return efforts;
}

/**
 * The control values to offer for a model, in menu order.
 *
 * `reasoning` is the catalog entry: `undefined` for a model the catalog does
 * not know, `null` for one it knows has no reasoning at all (OpenRouter omits
 * the field on non-reasoning and dynamic-router models).
 */
export function thinkingOptionsFor(reasoning) {
  if (reasoning === null) return [];
  const ladder = effortLadder(reasoning);
  if (ladder === null) return FALLBACK_LEVELS.map(toOption);

  // `mandatory` means the model rejects being switched off, and `none` is
  // OpenRouter's spelling of "off" inside an effort list — the Off entry is
  // what offers it, so it is never a separate item.
  const off = reasoning.mandatory === true ? [] : [toOption(THINKING_OFF)];
  if (ladder.length === 0) return [...off, toOption(THINKING_ON)];

  return [
    ...off,
    ...ladder
      .filter((effort) => effort !== "none")
      .sort(byEffort)
      .map(toOption),
  ];
}

function toOption(value) {
  return { value, label: thinkingLevelLabel(value) };
}

function byEffort(a, b) {
  // An effort the gateway adds later still sorts after the known ones rather
  // than disappearing from the menu.
  return (
    (EFFORT_ORDER.get(a) ?? THINKING_EFFORTS.length) -
    (EFFORT_ORDER.get(b) ?? THINKING_EFFORTS.length)
  );
}

/**
 * The control value a request should actually carry.
 *
 * A stored level is global and models are not, so it is resolved per model:
 * one the model offers is used as-is, anything else falls back to the model's
 * own `default_effort` and then to the app default. A model with no reasoning
 * at all resolves to "off" — asking a non-reasoning model for an effort is
 * what the catalog exists to prevent.
 */
export function resolveThinkingLevel(value, reasoning) {
  if (reasoning === undefined) {
    return isThinkingLevel(value) ? value : DEFAULT_THINKING_LEVEL;
  }

  const options = thinkingOptionsFor(reasoning).map((option) => option.value);
  if (options.length === 0) return THINKING_OFF;
  if (options.includes(value)) return value;

  // `default_effort: "none"` is the API saying "off by default", not an effort
  // to pre-select — and not a reason to switch an explicitly chosen level off.
  const preferred = reasoning?.default_effort;
  if (preferred !== "none" && options.includes(preferred)) return preferred;

  // An unsupported stored level keeps reasoning on at a level this model does
  // take; only "off" means off, and that is returned above wherever the model
  // allows it.
  if (options.includes(THINKING_ON)) return THINKING_ON;
  if (options.includes(DEFAULT_THINKING_LEVEL)) return DEFAULT_THINKING_LEVEL;
  return options.find((option) => option !== THINKING_OFF) ?? THINKING_OFF;
}

/**
 * The request body fields for a control value. `include_reasoning` rides
 * along because it is the same switch in its deprecated alias form and the
 * proxy has always accepted it; `exclude` decides whether the reasoning text
 * comes back at all.
 *
 * An unrecognised value resolves to the app default rather than being
 * forwarded: effort values are model-dependent and a rejected one is a 400.
 */
export function reasoningParamsFor(value) {
  const level = isThinkingLevel(value) ? value : DEFAULT_THINKING_LEVEL;
  if (level === THINKING_OFF) {
    return {
      include_reasoning: false,
      reasoning: { enabled: false, exclude: true },
    };
  }
  if (level === THINKING_ON) {
    return {
      include_reasoning: true,
      reasoning: { enabled: true, exclude: false },
    };
  }
  return {
    include_reasoning: true,
    reasoning: { effort: level, exclude: false },
  };
}
