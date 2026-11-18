/** Shared by settings, the chat client, and the server prompt builder. */
export const DEFAULT_INLINE_VIEW_FREQUENCY = "sometimes";
export const DEFAULT_INLINE_VIEW_FORMAT = "json-render";

export const INLINE_VIEW_FREQUENCIES = ["off", "sometimes", "often"];
export const INLINE_VIEW_FORMATS = ["description", "json-render", "html"];

export const INLINE_VIEW_FREQUENCY_OPTIONS = [
  {
    value: "off",
    label: "Off",
    description: "Never add a visual to a reply.",
  },
  {
    value: "sometimes",
    label: "Sometimes",
    description: "Only when a visual clearly explains the answer better.",
  },
  {
    value: "often",
    label: "Often",
    description: "Whenever the answer has data, a comparison, or a process.",
  },
];

export const INLINE_VIEW_FORMAT_OPTIONS = [
  {
    value: "description",
    label: "Description",
    description:
      "The model describes the view and a second model builds the HTML.",
  },
  {
    value: "json-render",
    label: "JSON render",
    description:
      "The model emits a JSON spec rendered with a fixed, safe component set.",
  },
  {
    value: "html",
    label: "HTML",
    description: "The model writes the HTML fragment itself.",
  },
];

export function normalizeInlineViewFrequency(value) {
  // The existing storage key used to hold a boolean. Keep an opt-out when
  // upgrading rather than silently enabling views again.
  if (value === false || value === "false") return "off";
  if (value === true || value === "true") return "sometimes";
  return INLINE_VIEW_FREQUENCIES.includes(value)
    ? value
    : DEFAULT_INLINE_VIEW_FREQUENCY;
}

export function normalizeInlineViewFormat(value) {
  return INLINE_VIEW_FORMATS.includes(value)
    ? value
    : DEFAULT_INLINE_VIEW_FORMAT;
}

/** Whether any inline view should be shown at all. */
export function isInlineViewsEnabled(frequency) {
  return normalizeInlineViewFrequency(frequency) !== "off";
}
