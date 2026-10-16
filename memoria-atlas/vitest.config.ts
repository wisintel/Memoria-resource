import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    setupFiles: ["./tests/setup/env.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
