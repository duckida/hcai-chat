import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return "/";
  },
  useParams() {
    return {};
  },
}));

// Mock Next.js Image component
vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img src={src} alt={alt} {...props} />;
  },
}));

// Suppress noisy framer-motion warnings in tests
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motionProxy = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (typeof prop !== "string") return undefined;
        return React.forwardRef(function MotionShim(
          { children, ...rest },
          ref,
        ) {
          return React.createElement(prop, { ...rest, ref }, children);
        });
      },
    },
  );
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }) => children,
  };
});

// Mock streamdown to a simple passthrough component
vi.mock("streamdown", () => ({
  Streamdown: ({ children }) => children,
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: vi.fn(),
    resolvedTheme: "light",
  }),
  ThemeProvider: ({ children }) => children,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }),
  Toaster: () => null,
}));

// Provide a structured-clone fallback for environments lacking it
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = (val) => JSON.parse(JSON.stringify(val));
}

// Polyfill ResizeObserver (used by Radix UI)
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Polyfill matchMedia (used by various UI libs)
if (typeof window !== "undefined" && typeof window.matchMedia === "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Polyfill scrollIntoView (used by Radix Select)
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}
