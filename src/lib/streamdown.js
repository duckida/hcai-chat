"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { useEffect, useState } from "react";

const math = createMathPlugin({ singleDollarTextMath: true });
const basePlugins = { code, math, cjk };

let mermaidPromise = null;

function loadMermaid() {
  mermaidPromise ??= import("@streamdown/mermaid").then((mod) => mod.mermaid);
  return mermaidPromise;
}

export function useStreamdownPlugins() {
  const [mermaid, setMermaid] = useState(null);

  useEffect(() => {
    let alive = true;
    loadMermaid()
      .then((plugin) => {
        if (alive) setMermaid(plugin);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return mermaid ? { ...basePlugins, mermaid } : basePlugins;
}
