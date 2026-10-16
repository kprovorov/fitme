import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // vitest 4+ restoreMocks only restores vi.spyOn spies; mockReset also
    // resets every vi.fn to its original implementation, as restoreMocks did in 3
    mockReset: true,
    restoreMocks: true,
  },
});
