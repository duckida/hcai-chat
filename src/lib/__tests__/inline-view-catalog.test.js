import { describe, expect, it } from "vitest";

import {
  INLINE_VIEW_COMPONENTS,
  INLINE_VIEW_COMPONENT_GUIDE,
  INLINE_VIEW_PROP_SIGNATURES,
  looksLikeJsonRenderSpec,
  parseInlineViewSpec,
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
