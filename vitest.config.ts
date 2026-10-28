import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/registry/**", "src/utils/**", "src/scan.ts"],
      reporter: ["text-summary", "text"],
    },
  },
});
