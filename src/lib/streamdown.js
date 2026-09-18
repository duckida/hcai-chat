"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { createMermaidPlugin } from "@streamdown/mermaid";
import { useMemo } from "react";

const math = createMathPlugin({ singleDollarTextMath: true });
const mermaid = createMermaidPlugin();

export function useStreamdownPlugins() {
  return useMemo(() => ({ code, math, cjk, mermaid }), []);
}
