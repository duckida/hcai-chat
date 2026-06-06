import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost:3000",
      },
    },
    setupFiles: ["./vitest.setup.jsx"],
    include: [
      "src/**/*.{test,spec}.{js,jsx,mjs,ts,tsx}",
      "src/**/__tests__/**/*.{js,jsx,mjs,ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{js,jsx,mjs}"],
      exclude: [
        "src/**/*.{test,spec}.{js,jsx,mjs}",
        "src/**/__tests__/**",
        "src/app/**/layout.js",
        "src/app/**/page.js",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
