import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import { reportError } from "@fitme/observability/node";

/**
 * The Exercises the Legacy Library's bundle lists for the index, which the
 * tools still check slugs against (ADR 0018), with its muscle groups.
 */
const indexedExercises = [
  { muscle_groups: ["chest", "triceps"], slug: "bench-press" },
  { muscle_groups: ["chest"], slug: "incline-dumbbell-press" },
  { muscle_groups: ["quadriceps", "glutes"], slug: "back-squat" },
];

/** The error a failing test index load rejects with. */
export const INDEX_OUTAGE = new Error("Blob is unavailable");

let loads: "fail" | "ok" = "ok";

// Reported the way agent/lib/library-index.ts reports, so a test mocking
// @fitme/observability/node sees the failed load.
const build = (): LibraryIndex =>
  createLibraryIndex({
    load: async () =>
      loads === "fail"
        ? await Promise.reject(INDEX_OUTAGE)
        : await Promise.resolve({
            exercises: indexedExercises,
            version: 1,
          }),
    reportError: async (error) => {
      await reportError(error, { exercise_library: "index" });
    },
  });

let index = build();

/**
 * The Library index the tools get in tests, in place of the instance's
 * (`vi.mock("../agent/lib/library-index", …)`): over the Legacy Library's
 * Exercises, as its bundle would list them, with no Covers.
 */
export const testLibraryIndex = {
  get: (): LibraryIndex => index,
  /**
   * A fresh index, as a new instance has; with `loads: "fail"` every load
   * rejects with INDEX_OUTAGE (reported), so the index is unavailable.
   */
  reset: (options: { loads?: "fail" | "ok" } = {}) => {
    loads = options.loads ?? "ok";
    index = build();
  },
};
