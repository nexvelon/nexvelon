import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// POLISH-15 — minimal component-test setup (jsdom) added to guard the recurring
// T&C signing regression with an actual interactive test. JSX is transformed by
// esbuild (automatic runtime) so no babel/vite-react plugin is needed.
export default defineConfig({
  resolve: {
    alias: { "@": resolve(process.cwd()) },
  },
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  // Override the app's Tailwind v4 PostCSS pipeline with an empty one — tests
  // check behaviour, not styles, and Vite can't load the Tailwind v4 plugin.
  css: { postcss: { plugins: [] } },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
  },
});
