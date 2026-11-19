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
const gap = z.enum(["none", "xs", "sm", "md", "lg", "xl"]).optional();
const series = z
  .array(z.object({ label: shortText, value: number }).strict())
  .max(100);
const choice = z
  .object({ label: shortText.min(1), value: shortText.min(1) })
  .strict();
const chartProps = z
  .object({ title: optionalText, description: text.optional(), data: series })
  .strict();
const quizProps = z
  .object({
    question: text.min(1),
    options: z.array(choice).min(2).max(8),
    answer: shortText.min(1),
    explanation: text.optional(),
  })
  .strict();

/** Even a state-bound href is checked again at render time. No app navigation. */
export function isSafeInlineViewUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

const externalUrl = z.string().refine(isSafeInlineViewUrl);

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
        align: z.enum(["start", "center", "end", "stretch"]).optional(),
        justify: z.enum(["start", "center", "end", "between"]).optional(),
      })
      .strict(),
    slots: ["default"],
    description: "Responsive vertical or wrapping horizontal layout.",
  },
  Grid: {
    props: z
      .object({ columns: z.number().int().min(1).max(6).optional(), gap })
      .strict(),
    slots: ["default"],
    description: "Responsive grid, collapsing to one column on small screens.",
  },
  Card: {
    props: z
      .object({
        title: optionalText,
        description: text.optional(),
        variant: z.enum(["default", "muted", "accent"]).optional(),
      })
      .strict(),
    slots: ["default"],
    description:
      "Inner panel for related content. Prefer Stack for the view root.",
  },
  Tabs: {
    props: z
      .object({
        label: optionalText,
        tabs: z.array(choice).min(1).max(8),
        value: optionalText,
      })
      .strict(),
    slots: ["default"],
    events: ["change"],
    description:
      "Tabbed content. Each direct child must be TabContent with a value matching a tab. Bind value with $bindState if needed.",
  },
  TabContent: {
    props: z.object({ value: shortText.min(1) }).strict(),
    slots: ["default"],
    description:
      "One tab's panel. Use only as a direct child of Tabs; value matches the tab value.",
  },
  Accordion: {
    props: z
      .object({
        title: shortText.min(1),
        description: text.optional(),
        expanded: z.boolean().optional(),
      })
      .strict(),
    slots: ["default"],
    events: ["change"],
    description:
      "Collapsible content section. Stack several for an accordion. Bind expanded with $bindState if needed.",
  },
  Heading: {
    props: z
      .object({
        text: shortText,
        level: z.enum(["h1", "h2", "h3", "h4"]).optional(),
      })
      .strict(),
    description:
      "Small section heading. Do not repeat the surrounding chat title.",
  },
  Text: {
    props: z
      .object({
        text,
        variant: z.enum(["body", "muted", "caption", "lead"]).optional(),
      })
      .strict(),
    description: "Plain text, never HTML. Supports $state and $template.",
  },
  Quiz: {
    props: quizProps,
    description:
      "Interactive single-question quiz. answer is one option's value. User picks an answer, checks it, and sees the explanation; no actions needed.",
  },
  InteractiveQuiz: {
    props: quizProps,
    description: "Alias for Quiz; prefer Quiz for new views.",
  },
  Separator: {
    props: z.object({ label: optionalText }).strict(),
    description: "Horizontal separator, with an optional section label.",
  },
  Metric: {
    props: z
      .object({
        label: shortText,
        value: z.union([text, number]),
        unit: optionalText,
        description: text.optional(),
        trend: z
          .object({
            value: z.union([shortText, number]),
            direction: z.enum(["up", "down", "neutral"]),
            sentiment: z.enum(["positive", "negative", "neutral"]).optional(),
            label: optionalText,
          })
          .strict()
          .optional(),
      })
      .strict(),
    description:
      "Prominent labeled value, optional unit, description and trend. Sentiment decides whether an up/down trend is good or bad.",
  },
  BarChart: {
    props: chartProps,
    description:
      "Compare labeled numeric values with zero-aligned bars, including negatives.",
  },
  LineChart: {
    props: chartProps,
    description:
      "Plot labeled numeric values in order, with axes, points and an area fill.",
  },
  PieChart: {
    props: z
      .object({
        title: optionalText,
        description: text.optional(),
        data: z
          .array(
            z
              .object({ label: shortText, value: number.nonnegative() })
              .strict(),
          )
          .min(1)
          .max(12),
        variant: z.enum(["pie", "donut"]).optional(),
        centerLabel: optionalText,
      })
      .strict(),
    description:
      "Proportional data with a labeled legend. Nonnegative values only. Defaults to a donut; variant='pie' makes a solid pie.",
  },
  BarGraph: {
    props: z.object({ title: optionalText, data: series }).strict(),
    description: "Legacy alias for BarChart. Prefer BarChart for new views.",
  },
  LineGraph: {
    props: z.object({ title: optionalText, data: series }).strict(),
    description: "Legacy alias for LineChart. Prefer LineChart for new views.",
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
  Badge: {
    props: z
      .object({
        label: shortText,
        variant: z
          .enum([
            "default",
            "primary",
            "success",
            "warning",
            "danger",
            "info",
            "outline",
          ])
          .optional(),
      })
      .strict(),
    description: "Small status badge with a semantic color or an outline.",
  },
  Timeline: {
    props: z
      .object({
        title: optionalText,
        items: z
          .array(
            z
              .object({
                title: shortText,
                description: text.optional(),
                date: optionalText,
                status: z.enum(["complete", "current", "upcoming"]).optional(),
              })
              .strict(),
          )
          .min(1)
          .max(30),
      })
      .strict(),
    description:
      "Vertical event or milestone timeline with dates and complete/current/upcoming status.",
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
  Callout: {
    props: z
      .object({
        title: optionalText,
        text: text.optional(),
        variant: z.enum(["info", "tip", "warning", "important"]).optional(),
      })
      .strict(),
    slots: ["default"],
    description:
      "Highlighted information, tip, warning or important note. Use text or children for its body.",
  },
  Link: {
    props: z
      .object({
        label: shortText.min(1),
        href: externalUrl,
        description: text.optional(),
      })
      .strict(),
    description:
      "External HTTP(S) link opened in a new tab. No javascript:, relative URLs or app navigation.",
  },
  Skeleton: {
    props: z
      .object({
        label: optionalText,
        variant: z.enum(["text", "card", "circle"]).optional(),
        lines: z.number().int().min(1).max(6).optional(),
      })
      .strict(),
    description:
      "Loading placeholder with text lines, a card or a circle. Use only when the content is genuinely loading.",
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
        variant: z
          .enum(["primary", "secondary", "outline", "ghost"])
          .optional(),
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
  Stack:
    "{ direction?: 'vertical' | 'horizontal', gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl', align?: 'start' | 'center' | 'end' | 'stretch', justify?: 'start' | 'center' | 'end' | 'between' }",
  Grid: "{ columns?: 1-6, gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' }",
  Card: "{ title?: string, description?: string, variant?: 'default' | 'muted' | 'accent' }",
  Tabs: "{ label?: string, tabs: Array<{ label: string, value: string }>, value?: string }",
  TabContent: "{ value: string }",
  Accordion: "{ title: string, description?: string, expanded?: boolean }",
  Heading: "{ text: string, level?: 'h1' | 'h2' | 'h3' | 'h4' }",
  Text: "{ text: string, variant?: 'body' | 'muted' | 'caption' | 'lead' }",
  Quiz: "{ question: string, options: Array<{ label: string, value: string }>, answer: string, explanation?: string }",
  InteractiveQuiz:
    "{ question: string, options: Array<{ label: string, value: string }>, answer: string, explanation?: string }",
  Separator: "{ label?: string }",
  Metric:
    "{ label: string, value: string | number, unit?: string, description?: string, trend?: { value: string | number, direction: 'up' | 'down' | 'neutral', sentiment?: 'positive' | 'negative' | 'neutral', label?: string } }",
  BarChart:
    "{ title?: string, description?: string, data: Array<{ label: string, value: number }> }",
  LineChart:
    "{ title?: string, description?: string, data: Array<{ label: string, value: number }> }",
  PieChart:
    "{ title?: string, description?: string, data: Array<{ label: string, value: number }>, variant?: 'pie' | 'donut', centerLabel?: string }",
  BarGraph: "{ title?: string, data: Array<{ label: string, value: number }> }",
  LineGraph:
    "{ title?: string, data: Array<{ label: string, value: number }> }",
  Table:
    "{ columns: string[], rows: Array<Array<string | number>>, caption?: string }",
  Badge:
    "{ label: string, variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'outline' }",
  Timeline:
    "{ title?: string, items: Array<{ title: string, description?: string, date?: string, status?: 'complete' | 'current' | 'upcoming' }> }",
  Progress: "{ label: string, value: number, max?: number }",
  Callout:
    "{ title?: string, text?: string, variant?: 'info' | 'tip' | 'warning' | 'important' }",
  Link: "{ label: string, href: string, description?: string }",
  Skeleton:
    "{ label?: string, variant?: 'text' | 'card' | 'circle', lines?: 1-6 }",
  Slider:
    "{ label: string, value?: number, min?: number, max?: number, step?: number }",
  Input: "{ label: string, value?: string, placeholder?: string }",
  Select:
    "{ label: string, value?: string, options: Array<{ label: string, value: string }> }",
  Checkbox: "{ label: string, checked?: boolean }",
  Button:
    "{ label: string, variant?: 'primary' | 'secondary' | 'outline' | 'ghost' }",
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

// Tab identities describe the tree, not reactive data. Letting them change via
// state would disconnect a tab's control from the panel it labels.
const STATIC_PROPS = {
  Tabs: ["tabs"],
  TabContent: ["value"],
};

const propSchemas = Object.fromEntries(
  Object.entries(INLINE_VIEW_COMPONENTS).map(([name, component]) => [
    name,
    z
      .object(
        Object.fromEntries(
          Object.entries(component.props.shape).map(([key, value]) => [
            key,
            STATIC_PROPS[name]?.includes(key)
              ? value
              : z.union([value, expression]),
          ]),
        ),
      )
      .strict(),
  ]),
);

function hasValidChoices(options) {
  return new Set(options.map((option) => option.value)).size === options.length;
}

function validPropRelationships(type, props) {
  if (
    ["Quiz", "InteractiveQuiz"].includes(type) &&
    Array.isArray(props.options)
  ) {
    if (!hasValidChoices(props.options)) return false;
    if (
      typeof props.answer === "string" &&
      !props.options.some((option) => option.value === props.answer)
    )
      return false;
  }
  if (type === "Tabs") {
    if (!hasValidChoices(props.tabs)) return false;
    if (
      typeof props.value === "string" &&
      !props.tabs.some((tab) => tab.value === props.value)
    )
      return false;
  }
  if (
    type === "Slider" &&
    typeof props.min === "number" &&
    typeof props.max === "number" &&
    props.min >= props.max
  )
    return false;
  if (
    type === "Table" &&
    Array.isArray(props.columns) &&
    Array.isArray(props.rows)
  ) {
    return (
      new Set(props.columns).size === props.columns.length &&
      props.rows.every((row) => row.length === props.columns.length)
    );
  }
  if (
    type === "Select" &&
    Array.isArray(props.options) &&
    !hasValidChoices(props.options)
  )
    return false;
  return true;
}

/** State expressions must not bypass the same closed prop schemas as literals. */
export function validateInlineViewProps(type, props) {
  if (!Object.hasOwn(INLINE_VIEW_COMPONENTS, type)) return null;
  const definition = INLINE_VIEW_COMPONENTS[type];
  if (!definition || hasUnsafeData(props)) return null;
  const parsed = definition.props.safeParse(props);
  return parsed.success && validPropRelationships(type, parsed.data)
    ? parsed.data
    : null;
}

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
        !validPropRelationships(element.type, props.data) ||
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
      if (element.type === "Tabs") {
        const values = element.props.tabs.map((tab) => tab.value);
        const panels = element.children.map((child) => spec.elements[child]);
        if (
          panels.length !== values.length ||
          panels.some(
            (panel) =>
              panel?.type !== "TabContent" || panel.visible !== undefined,
          )
        )
          return false;
        const panelValues = panels.map((panel) => panel.props.value);
        if (
          new Set(panelValues).size !== values.length ||
          values.some((value) => !panelValues.includes(value))
        )
          return false;
      }
      if (element.type === "TabContent") {
        const parent = [...ancestors].at(-1);
        if (spec.elements[parent]?.type !== "Tabs") return false;
      }
      const next = new Set(ancestors).add(key);
      return element.children.every((child) => visit(child, next));
    };
    return visit(spec.root, new Set()) ? spec : null;
  } catch {
    return null;
  }
}
