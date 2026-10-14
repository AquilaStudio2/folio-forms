import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    include: ["test/ui/**/*.test.tsx"],
    setupFiles: ["./test/ui/setup.ts"],
    testTimeout: 15_000,
  },
});
