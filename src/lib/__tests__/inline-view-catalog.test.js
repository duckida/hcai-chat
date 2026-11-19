import { describe, expect, it } from "vitest";

import {
  INLINE_VIEW_COMPONENTS,
  INLINE_VIEW_COMPONENT_GUIDE,
  INLINE_VIEW_PROP_SIGNATURES,
  isSafeInlineViewUrl,
  looksLikeJsonRenderSpec,
  parseInlineViewSpec,
  validateInlineViewProps,
} from "../inline-view-catalog";

const validSpec = {
  root: "root",
  elements: {
    root: { type: "Stack", props: {}, children: ["heading", "chart"] },
    heading: { type: "Heading", props: { text: "Monthly rainfall" } },
    chart: {
      type: "BarGraph",
      props: {
        data: [
          { label: "Jan", value: 12 },
          { label: "Feb", value: -3 },
        ],
      },
    },
  },
};

const parse = (spec) => parseInlineViewSpec(JSON.stringify(spec));
const oneElement = (type, props) => ({ root: "root", elements: { root: { type, props } } });

const tabsSpec = {
  root: "tabs",
  elements: {
    tabs: {
      type: "Tabs",
      props: { tabs: [{ label: "Overview", value: "overview" }, { label: "Details", value: "details" }] },
      children: ["overview", "details"],
    },
    overview: { type: "TabContent", props: { value: "overview" }, children: ["first"] },
    details: { type: "TabContent", props: { value: "details" }, children: ["second"] },
    first: { type: "Text", props: { text: "First tab" } },
    second: { type: "Text", props: { text: "Second tab" } },
  },
};
const quiz = {
  question: "Which is a prime?",
  options: [{ label: "Four", value: "four" }, { label: "Five", value: "five" }],
  answer: "five",
  explanation: "Five has only two divisors.",
};

describe("parseInlineViewSpec", () => {
  it("accepts a complete spec and defaults the optional fields", () => {
    const spec = parse(validSpec);
    expect(spec).not.toBeNull();
    expect(spec.root).toBe("root");
    expect(spec.state).toEqual({});
    expect(spec.elements.heading.children).toEqual([]);
  });

  it("accepts a spec wrapped in a JSON fence", () => {
    expect(
      parseInlineViewSpec(`\`\`\`json\n${JSON.stringify(validSpec)}\n\`\`\``),
    ).not.toBeNull();
  });

  it("rejects an unknown component", () => {
    expect(
      parse({
        root: "root",
        elements: {
          root: { type: "Script", props: { src: "https://evil.test" } },
        },
      }),
    ).toBeNull();
  });

  it("rejects a prop the component does not declare", () => {
    expect(
      parse({
        root: "root",
        elements: {
          root: { type: "Text", props: { text: "hi", href: "https://x" } },
        },
      }),
    ).toBeNull();
  });

  it("rejects children on a component without slots", () => {
    expect(
      parse({
        root: "root",
        elements: {
          root: { type: "Text", props: { text: "hi" }, children: ["leaf"] },
          leaf: { type: "Text", props: { text: "leaf" } },
        },
      }),
    ).toBeNull();
  });

  it("rejects a missing root element", () => {
    expect(
      parse({
        root: "nope",
        elements: { root: { type: "Text", props: { text: "hi" } } },
      }),
    ).toBeNull();
  });

  it("rejects a cycle and an over-deep tree", () => {
    expect(
      parse({
        root: "a",
        elements: {
          a: { type: "Stack", props: {}, children: ["b"] },
          b: { type: "Stack", props: {}, children: ["a"] },
        },
      }),
    ).toBeNull();

    const elements = {};
    for (let i = 0; i < 40; i++) {
      elements[`n${i}`] = {
        type: "Stack",
        props: {},
        children: [`n${i + 1}`],
      };
    }
    elements.n40 = { type: "Text", props: { text: "end" } };
    expect(parse({ root: "n0", elements })).toBeNull();
  });

  it("rejects prototype-pollution keys anywhere in the tree", () => {
    expect(
      parseInlineViewSpec(
        '{"root":"root","elements":{"root":{"type":"Stack","props":{"__proto__":{"polluted":true}}}}}',
      ),
    ).toBeNull();
    expect(
      parseInlineViewSpec(
        '{"root":"root","elements":{"root":{"type":"Stack","props":{},"children":[]}},"__proto__":{"x":1}}',
      ),
    ).toBeNull();
  });

  it("rejects an unsafe state path", () => {
    expect(
      parse({
        root: "root",
        elements: {
          root: {
            type: "Input",
            props: { label: "Name", value: { $bindState: "/__proto__/name" } },
          },
        },
      }),
    ).toBeNull();
    expect(
      parse({
        root: "root",
        elements: {
          root: {
            type: "Button",
            props: { label: "Go" },
            on: {
              press: {
                action: "setState",
                params: { statePath: "/constructor/x", value: 1 },
              },
            },
          },
        },
      }),
    ).toBeNull();
  });

  it("allows only the setState action and only on a declared event", () => {
    const base = {
      root: "root",
      elements: {
        root: { type: "Button", props: { label: "Go" } },
      },
    };
    expect(
      parse({
        ...base,
        elements: {
          root: {
            ...base.elements.root,
            on: {
              press: {
                action: "setState",
                params: { statePath: "/count", value: 1 },
              },
            },
          },
        },
      }),
    ).not.toBeNull();
    expect(
      parse({
        ...base,
        elements: {
          root: {
            ...base.elements.root,
            on: {
              press: {
                action: "fetch",
                params: { statePath: "/count", value: 1 },
              },
            },
          },
        },
      }),
    ).toBeNull();
    // `Text` declares no events, so even a state-only action is rejected.
    expect(
      parse({
        root: "root",
        elements: {
          root: {
            type: "Text",
            props: { text: "hi" },
            on: {
              press: {
                action: "setState",
                params: { statePath: "/count", value: 1 },
              },
            },
          },
        },
      }),
    ).toBeNull();
  });

  it("rejects a malformed body rather than throwing", () => {
    expect(parseInlineViewSpec("{")).toBeNull();
    expect(parseInlineViewSpec("")).toBeNull();
    expect(parseInlineViewSpec(null)).toBeNull();
  });

  it.each([
    ["Grid", { columns: 6, gap: "xl" }],
    ["Stack", { direction: "horizontal", align: "stretch", justify: "between", gap: "none" }],
    ["Card", { title: "Results", variant: "accent" }],
    ["Accordion", { title: "More details", expanded: true }],
    ["Heading", { text: "Main heading", level: "h1" }],
    ["Text", { text: "A lead paragraph", variant: "lead" }],
    ["Quiz", quiz],
    ["InteractiveQuiz", quiz],
    ["Separator", { label: "Next" }],
    ["BarChart", { data: [{ label: "Jan", value: -12 }], description: "Monthly change" }],
    ["LineChart", { data: [{ label: "Jan", value: 12 }] }],
    ["PieChart", { data: [{ label: "Used", value: 60 }, { label: "Free", value: 40 }], variant: "donut" }],
    ["Metric", { label: "Users", value: 1234, trend: { value: "12%", direction: "up", sentiment: "positive", label: "vs last month" } }],
    ["Badge", { label: "Ready", variant: "success" }],
    ["Timeline", { items: [{ title: "Started", date: "Today", status: "complete" }] }],
    ["Callout", { title: "Heads up", text: "Save your work", variant: "important" }],
    ["Link", { label: "Read more", href: "https://example.com/docs" }],
    ["Skeleton", { variant: "card", lines: 6 }],
  ])("accepts the %s component with its documented props", (type, props) => {
    expect(parse(oneElement(type, props))).not.toBeNull();
  });

  it.each([
    ["Grid", { columns: 7 }],
    ["Grid", { columns: 0 }],
    ["Heading", { text: "Oops", level: "h5" }],
    ["PieChart", { data: [{ label: "Invalid", value: -1 }] }],
    ["PieChart", { data: Array.from({ length: 13 }, (_, index) => ({ label: String(index), value: 1 })) }],
    ["Skeleton", { lines: 7 }],
    ["Timeline", { items: Array.from({ length: 31 }, () => ({ title: "Too many" })) }],
    ["Callout", { text: "Oops", variant: "script" }],
    ["Card", { title: "Oops", className: "fixed" }],
    ["Text", { text: "Oops", style: { position: "fixed" } }],
    ["Slider", { label: "Range", min: 10, max: 1 }],
    ["Table", { columns: ["Name", "Value"], rows: [["Missing value"]] }],
    ["Table", { columns: ["Name", "Name"], rows: [] }],
    ["Quiz", { ...quiz, answer: "six" }],
    ["Quiz", { ...quiz, options: [{ label: "One", value: "five" }, { label: "Two", value: "five" }] }],
  ])("rejects invalid or out-of-bounds %s props", (type, props) => {
    expect(parse(oneElement(type, props))).toBeNull();
  });

  it("validates tabs and panel identities together, while allowing bound selection", () => {
    expect(parse(tabsSpec)).not.toBeNull();
    const bound = structuredClone(tabsSpec);
    bound.elements.tabs.props.value = { $bindState: "/tab" };
    bound.state = { tab: "details" };
    expect(parse(bound)).not.toBeNull();

    for (const breakSpec of [
      (spec) => { spec.elements.tabs.children.pop(); },
      (spec) => { spec.elements.details.props.value = "unknown"; },
      (spec) => { spec.elements.details.props.value = "overview"; },
      (spec) => { spec.elements.details.type = "Stack"; spec.elements.details.props = {}; },
      (spec) => { spec.elements.details.visible = false; },
      (spec) => { spec.elements.details.props.value = { $state: "/panel" }; },
      (spec) => { spec.elements.tabs.props.tabs = { $state: "/tabs" }; },
      (spec) => { spec.elements.tabs.props.value = "unknown"; },
      (spec) => { spec.elements.tabs.props.tabs[1].value = "overview"; },
    ]) {
      const invalid = structuredClone(tabsSpec);
      breakSpec(invalid);
      expect(parse(invalid)).toBeNull();
    }
    expect(parse(oneElement("TabContent", { value: "alone" }))).toBeNull();
  });

  it("permits only explicit view-state actions on the new interactive controls", () => {
    const spec = oneElement("Accordion", { title: "Details", expanded: { $bindState: "/open" } });
    spec.elements.root.on = { change: { action: "setState", params: { statePath: "/clicked", value: true } } };
    expect(parse(spec)).not.toBeNull();
    spec.elements.root.on.change.action = "navigate";
    expect(parse(spec)).toBeNull();
    spec.elements.root.on.change.action = "setState";
    spec.elements.root.on.change.params.statePath = "/__proto__/polluted";
    expect(parse(spec)).toBeNull();
  });
});

describe("safe link URLs", () => {
  it.each(["https://example.com/docs?q=hello", "http://example.com", "https://example.com/#section"])("accepts %s", (href) => {
    expect(isSafeInlineViewUrl(href)).toBe(true);
    expect(parse(oneElement("Link", { label: "Docs", href }))).not.toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,<script>bad</script>", "//example.com", "/settings", "mailto:a@example.com", "https://user:password@example.com", "https://", ""])("rejects %s", (href) => {
    expect(isSafeInlineViewUrl(href)).toBe(false);
    expect(parse(oneElement("Link", { label: "Docs", href }))).toBeNull();
    expect(validateInlineViewProps("Link", { label: "Docs", href })).toBeNull();
  });
});

describe("resolved prop validation", () => {
  it("rejects bad state results without losing valid ones", () => {
    expect(validateInlineViewProps("Text", { text: "Safe" })).toEqual({ text: "Safe" });
    expect(validateInlineViewProps("Text", { text: { not: "text" } })).toBeNull();
    expect(validateInlineViewProps("Heading", { text: "Safe", level: "script" })).toBeNull();
    expect(validateInlineViewProps("PieChart", { data: [{ label: "Bad", value: -1 }] })).toBeNull();
    expect(validateInlineViewProps("LineChart", { data: Array.from({ length: 101 }, () => ({ label: "Too many", value: 1 })) })).toBeNull();
    expect(validateInlineViewProps("Quiz", { ...quiz, answer: "missing" })).toBeNull();
    expect(validateInlineViewProps("constructor", {})).toBeNull();
  });
});

describe("looksLikeJsonRenderSpec", () => {
  it("distinguishes JSON from a brief or markup", () => {
    expect(looksLikeJsonRenderSpec('{"root":"r","elements":{}}')).toBe(true);
    expect(looksLikeJsonRenderSpec("```json\n{}\n```")).toBe(true);
    expect(looksLikeJsonRenderSpec('  {"elements":')).toBe(true);
    expect(looksLikeJsonRenderSpec("A chart of rainfall")).toBe(false);
    expect(looksLikeJsonRenderSpec("<div>chart</div>")).toBe(false);
    // A brief may open with a brace; only a spec-shaped object counts.
    expect(looksLikeJsonRenderSpec("{Revenue} by month")).toBe(false);
    expect(looksLikeJsonRenderSpec('{"title":"Rainfall"}')).toBe(false);
  });
});

describe("prompt catalog", () => {
  it("documents every component exactly once", () => {
    const names = Object.keys(INLINE_VIEW_COMPONENTS);
    expect(Object.keys(INLINE_VIEW_PROP_SIGNATURES)).toEqual(names);
    expect(INLINE_VIEW_COMPONENT_GUIDE).toHaveLength(names.length);
    for (const name of names) {
      expect(INLINE_VIEW_COMPONENT_GUIDE.some((line) => line.startsWith(`- ${name} `))).toBe(
        true,
      );
    }
  });
});
