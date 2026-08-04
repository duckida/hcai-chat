"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { createMathPlugin } from "@streamdown/math";
import { useMemo } from "react";

const math = createMathPlugin({ singleDollarTextMath: true });

const MERMAID_DEFAULTS = {
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
  fontFamily: "monospace",
  suppressErrorRendering: true,
};

const MERMAID_CDN_URL =
  "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

let mermaidLibPromise = null;

function loadMermaidLib() {
  mermaidLibPromise ??= new Promise((resolve, reject) => {
    if (typeof window === "undefined") return;
    if (window.mermaid) {
      resolve(window.mermaid);
      return;
    }
    const script = document.createElement("script");
    script.src = MERMAID_CDN_URL;
    script.async = true;
    script.dataset.hcaiMermaid = "true";
    script.onload = () => resolve(window.mermaid);
    script.onerror = () => {
      mermaidLibPromise = null;
      reject(new Error("Failed to load mermaid from CDN"));
    };
    document.head.appendChild(script);
  });
  return mermaidLibPromise;
}

function createMermaidPlugin(config = {}) {
  let initialized = false;
  let resolvedConfig = { ...MERMAID_DEFAULTS, ...config };
  const instance = {
    async initialize(cfg) {
      resolvedConfig = { ...MERMAID_DEFAULTS, ...config, ...cfg };
      const lib = await loadMermaidLib();
      lib.initialize(resolvedConfig);
      initialized = true;
    },
    async render(id, source) {
      const lib = await loadMermaidLib();
      if (!initialized) {
        lib.initialize(resolvedConfig);
        initialized = true;
      }
      return lib.render(id, source);
    },
  };
  return {
    name: "mermaid",
    type: "diagram",
    language: "mermaid",
    getMermaid(cfg) {
      if (cfg) instance.initialize(cfg);
      return instance;
    },
  };
}

const mermaid = createMermaidPlugin();

export function useStreamdownPlugins() {
  return useMemo(() => ({ code, math, cjk, mermaid }), []);
}
