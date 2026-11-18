/**
 * The json-render catalog an inline view is allowed to use.
 *
 * The model emits a complete spec inside `<inline format="json-render">`, not
 * json-render's patch stream, so the chat stream and message ordering stay
 * exactly as they are. Everything in this file is deliberately small and
 * closed: a fixed component list, a fixed action (`setState`), bounded values
 * and a bounded tree. A spec that reaches outside the catalog renders nothing
 * instead of reaching the app or the network.
 *
 * Imported by the chat route and by client components, so it must stay free of
 * React and browser globals.
 */

import {
  defineCatalog,
  VisibilityConditionStrictSchema,
} from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

const text = z.string().max(4000);
const shortText = z.string().max(160);
const number = z.number().finite();
const optionalText = shortText.optional();
const gap = z.enum(["sm", "md", "lg"]).optional();
const series = z
  .array(z.object({ label: shortText, value: number }).strict())
  .max(100);

function isSafePath(path) {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    path.length <= 200 &&
    path
      .split("/")
      .every(
        (part) =>
          !["__proto__", "prototype", "constructor"].includes(
            part.replace(/~1/g, "/").replace(/~0/g, "~"),
          ),
      )
  );
}

const statePath = z.string().refine(isSafePath);
const expression = z.union([
  z.object({ $state: statePath }).strict(),
  z.object({ $bindState: statePath }).strict(),
  z.object({ $template: text }).strict(),
  z
    .object({
      $cond: VisibilityConditionStrictSchema,
      $then: z.unknown(),
      $else: z.unknown(),
    })
    .strict(),
]);

/** Only view-local state changes are available; no app actions or network IO. */
const action = z
  .object({
    action: z.literal("setState"),
    params: z.object({ statePath, value: z.unknown() }).strict(),
  })
  .strict();

export const INLINE_VIEW_COMPONENTS = {
  Stack: {
    props: z
      .object({
        direction: z.enum(["vertical", "horizontal"]).optional(),
        gap,
      })
      .strict(),
    slots: ["default"],
    description: "Responsive vertical or wrapping horizontal layout.",
  },
  Grid: {
    props: z
      .object({ columns: z.number().int().min(1).max(4).optional(), gap })
      .strict(),
    slots: ["default"],
    description: "Responsive grid, collapsing to one column on small screens.",
  },
  Card: {
    props: z
      .object({ title: optionalText, description: text.optional() })
      .strict(),
    slots: ["default"],
    description:
      "Inner panel for related content. Prefer Stack for the view root.",
  },
  Heading: {
    props: z
      .object({ text: shortText, level: z.enum(["h2", "h3", "h4"]).optional() })
      .strict(),
    description:
      "Small section heading. Do not repeat the surrounding chat title.",
  },
  Text: {
    props: z
      .object({ text, variant: z.enum(["body", "muted"]).optional() })
      .strict(),
    description: "Plain text, never HTML. Supports $state and $template.",
  },
  Metric: {
    props: z
      .object({
        label: shortText,
        value: z.union([text, number]),
        unit: optionalText,
      })
      .strict(),
    description: "A prominent value with its label and optional unit.",
  },
  BarGraph: {
    props: z.object({ title: optionalText, data: series }).strict(),
    description:
      "Compare labeled numeric values in a bar chart, including negatives.",
  },
  LineGraph: {
    props: z.object({ title: optionalText, data: series }).strict(),
    description:
      "Plot labeled numeric values in order as a responsive line chart.",
  },
  Table: {
    props: z
      .object({
        columns: z.array(shortText).min(1).max(12),
        rows: z.array(z.array(z.union([text, number])).max(12)).max(100),
        caption: optionalText,
      })
      .strict(),
    description: "Compact data table. rows is a 2D array matching columns.",
  },
  Progress: {
    props: z
      .object({
        label: shortText,
        value: number,
        max: number.positive().optional(),
      })
      .strict(),
    description: "Labeled progress toward max (default 100).",
  },
  Slider: {
    props: z
      .object({
        label: shortText,
        value: number.optional(),
        min: number.optional(),
        max: number.optional(),
        step: number.positive().optional(),
      })
      .strict(),
    events: ["change"],
    description:
      "Labeled numeric slider. Bind value with {$bindState:'/path'}.",
  },
  Input: {
    props: z
      .object({
        label: shortText,
        value: text.optional(),
        placeholder: optionalText,
      })
      .strict(),
    events: ["change"],
    description: "Labeled text input. Bind value with {$bindState:'/path'}.",
  },
  Select: {
    props: z
      .object({
        label: shortText,
        value: shortText.optional(),
        options: z
          .array(z.object({ label: shortText, value: shortText }).strict())
          .min(1)
          .max(30),
      })
      .strict(),
    events: ["change"],
    description:
      "Labeled choice control. Bind value with {$bindState:'/path'}.",
  },
  Checkbox: {
    props: z
      .object({ label: shortText, checked: z.boolean().optional() })
      .strict(),
    events: ["change"],
    description: "Labeled checkbox. Bind checked with {$bindState:'/path'}.",
  },
  Button: {
    props: z
      .object({
        label: shortText,
        variant: z.enum(["primary", "secondary"]).optional(),
      })
      .strict(),
    events: ["press"],
    description:
      "Button with on.press bound to setState, changing only this view.",
  },
};

/**
 * Compact prop signatures for the prompt. Kept beside the schemas above so a
 * new component cannot be added without a doc line, and a doc line cannot
 * describe a prop the validator rejects.
 */
export const INLINE_VIEW_PROP_SIGNATURES = {
  Stack: "{ direction?: 'vertical' | 'horizontal', gap?: 'sm' | 'md' | 'lg' }",
  Grid: "{ columns?: 1-4, gap?: 'sm' | 'md' | 'lg' }",
  Card: "{ title?: string, description?: string }",
  Heading: "{ text: string, level?: 'h2' | 'h3' | 'h4' }",
  Text: "{ text: string, variant?: 'body' | 'muted' }",
  Metric: "{ label: string, value: string | number, unit?: string }",
  BarGraph: "{ title?: string, data: Array<{ label: string, value: number }> }",
  LineGraph:
    "{ title?: string, data: Array<{ label: string, value: number }> }",
  Table:
    "{ columns: string[], rows: Array<Array<string | number>>, caption?: string }",
  Progress: "{ label: string, value: number, max?: number }",
  Slider:
    "{ label: string, value?: number, min?: number, max?: number, step?: number }",
  Input: "{ label: string, value?: string, placeholder?: string }",
  Select:
    "{ label: string, value?: string, options: Array<{ label: string, value: string }> }",
  Checkbox: "{ label: string, checked?: boolean }",
  Button: "{ label: string, variant?: 'primary' | 'secondary' }",
};

/** One line per component, ready to drop into the system prompt. */
export const INLINE_VIEW_COMPONENT_GUIDE = Object.entries(
  INLINE_VIEW_COMPONENTS,
).map(([name, component]) => {
  const children = component.slots?.length
    ? " Children allowed."
    : " No children.";
  const events = component.events?.length
    ? ` Events: ${component.events.join(", ")}.`
    : "";
  return `- ${name} ${INLINE_VIEW_PROP_SIGNATURES[name]}. ${component.description}${children}${events}`;
});

export const inlineViewCatalog = defineCatalog(schema, {
  components: INLINE_VIEW_COMPONENTS,
  actions: {},
});

const propSchemas = Object.fromEntries(
  Object.entries(INLINE_VIEW_COMPONENTS).map(([name, component]) => [
    name,
    z
      .object(
        Object.fromEntries(
          Object.entries(component.props.shape).map(([key, value]) => [
            key,
            z.union([value, expression]),
          ]),
        ),
      )
      .strict(),
  ]),
);

const specSchema = z
  .object({
    root: shortText.min(1),
    elements: z.record(
      shortText.min(1),
      z
        .object({
          type: z.enum(Object.keys(INLINE_VIEW_COMPONENTS)),
          props: z.record(z.string(), z.unknown()).default({}),
          children: z.array(shortText.min(1)).max(100).default([]),
          on: z
            .record(z.string(), z.union([action, z.array(action).max(10)]))
            .optional(),
          visible: VisibilityConditionStrictSchema.optional(),
        })
        .strict(),
    ),
    state: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

function hasUnsafeData(value, depth = 0) {
  if (depth > 20) return true;
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return (
      value.length > 100 || value.some((item) => hasUnsafeData(item, depth + 1))
    );
  }
  return Object.entries(value).some(
    ([key, item]) =>
      ["__proto__", "prototype", "constructor"].includes(key) ||
      (["$state", "$bindState", "statePath"].includes(key) &&
        !isSafePath(item)) ||
      hasUnsafeData(item, depth + 1),
  );
}

function stripFence(source) {
  return String(source || "")
    .trim()
    .replace(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/i, "$1");
}

/**
 * Whether a body is meant to be JSON. Deliberately structural rather than
 * "does it parse": an invalid spec should fail visibly as a view, never be
 * shipped to the description builder as if it were prose. A `json` fence is
 * an explicit signal, so it qualifies even when the object alone is empty; a
 * bare `{` is not, or a brief like "{Revenue} by month" would be routed here.
 */
export function looksLikeJsonRenderSpec(source) {
  const text = String(source || "").trim();
  if (/^```json\s*\n/i.test(text)) return true;
  const body = stripFence(text);
  if (!body.startsWith("{")) return false;
  // Every spec declares a root and an element map. Matching the key textually
  // also catches a spec truncated mid-stream, which must not reach the builder.
  return /"(?:root|elements)"\s*:/.test(body);
}

/** Invalid specs stay inert rather than reaching the builder or crashing chat. */
export function parseInlineViewSpec(source) {
  try {
    const body = stripFence(source);
    if (body.length > 100_000) return null;
    const raw = JSON.parse(body);
    if (hasUnsafeData(raw)) return null;
    const result = specSchema.safeParse(raw);
    if (!result.success) return null;
    const spec = result.data;
    const keys = Object.keys(spec.elements);
    if (keys.length === 0 || keys.length > 100 || !spec.elements[spec.root]) {
      return null;
    }
    for (const element of Object.values(spec.elements)) {
      const definition = INLINE_VIEW_COMPONENTS[element.type];
      const props = propSchemas[element.type].safeParse(element.props);
      if (
        !props.success ||
        (!definition.slots && element.children.length > 0)
      ) {
        return null;
      }
      element.props = props.data;
      if (
        Object.keys(element.on || {}).some(
          (event) => !definition.events?.includes(event),
        )
      ) {
        return null;
      }
    }
    // A flat map can describe cycles or an exponentially expanding DAG. Bound
    // the actual render tree, not just the number of entries in the map.
    let count = 0;
    const visit = (key, ancestors) => {
      if (++count > 100 || ancestors.size >= 16 || ancestors.has(key)) {
        return false;
      }
      const element = spec.elements[key];
      if (!element) return false;
      const next = new Set(ancestors).add(key);
      return element.children.every((child) => visit(child, next));
    };
    return visit(spec.root, new Set()) ? spec : null;
  } catch {
    return null;
  }
}
