import { createLibraryIndex } from "@fitme/library-bundle/library-index";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import { reportError } from "@fitme/observability/node";

/** The error a failing test index load rejects with. */
export const INDEX_OUTAGE = new Error("Blob is unavailable for library.json");

/** A Cover as the test bundle writes it. */
export interface TestCover {
  id: string;
  muscle_groups: string[];
}

/** The chest Covers. */
export const CHEST_COVERS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
] as const;

/** The legs Cover. */
export const LEGS_COVER = "33333333-3333-4333-8333-333333333333";

/** The back Cover. */
export const BACK_COVER = "44444444-4444-4444-8444-444444444444";

/**
 * The Covers the test index serves: two for chest, one for legs, one for
 * back; none for core, so a core Workout falls back to any Cover.
 */
export const testCovers: TestCover[] = [
  { id: CHEST_COVERS[0], muscle_groups: ["chest", "triceps"] },
  { id: CHEST_COVERS[1], muscle_groups: ["chest", "shoulders"] },
  { id: LEGS_COVER, muscle_groups: ["quadriceps", "glutes"] },
  { id: BACK_COVER, muscle_groups: ["back", "biceps"] },
];

let loads: "fail" | "ok" = "ok";
let covers: TestCover[] = testCovers;
let loadCount = 0;

// A v1 bundle: the index reads its Covers; its Exercises don't matter here.
const build = (): LibraryIndex =>
  createLibraryIndex({
    load: async () => {
      loadCount += 1;

      return loads === "fail"
        ? await Promise.reject(INDEX_OUTAGE)
        : await Promise.resolve({ covers, exercises: [], version: 1 });
    },
    // Reported the way agent/lib/library-index.ts reports, so a test mocking
    // @fitme/observability/node sees the failed load.
    reportError: async (error) => {
      await reportError(error, { exercise_library: "index" });
    },
  });

let index = build();

/**
 * The Library index the Cover helper gets in tests, in place of the
 * instance's (`vi.mock("../agent/lib/library-index", …)`), over `testCovers`.
 */
export const testLibraryIndex = {
  get: (): LibraryIndex => index,
  /** How many times the current index has loaded. */
  loads: () => loadCount,
  /**
   * A fresh index, as a new instance has; with `loads: "fail"` every load
   * rejects with INDEX_OUTAGE (reported); `covers` serves other Covers.
   */
  reset: (options: { covers?: TestCover[]; loads?: "fail" | "ok" } = {}) => {
    loads = options.loads ?? "ok";
    covers = options.covers ?? testCovers;
    loadCount = 0;
    index = build();
  },
};
