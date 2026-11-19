import type { LibraryBundleV2 } from "@fitme/library-bundle/v2";
import { createLibraryV2 } from "@fitme/library-bundle/v2/library";
import type { LibraryV2 } from "@fitme/library-bundle/v2/library";
import { reportError } from "@fitme/observability/node";

/** The error a failing test Library load rejects with. */
export const LIBRARY_OUTAGE = new Error("Blob is unavailable");

const media = (digit: string) => ({
  thumbnail: { extension: "jpg" as const, oid: digit.repeat(64) },
  video: { extension: "mp4" as const, oid: digit.repeat(64) },
});

const text = (name: string) => ({
  benefits: [],
  common_mistakes: [`Rushing the ${name}.`],
  long_description: `${name}, at length.`,
  name,
  short_description: `${name}, briefly.`,
  steps: [`Do the ${name}.`],
  tags: [],
  use_cases: [],
});

/**
 * The v2 bundle the tool tests' Library is built from. Bench Press and Back
 * Squat are translated into Ukrainian, Incline Dumbbell Press isn't; their
 * Equipment overlaps on purpose, so an any-of filter tells them apart. The
 * Pull-up needs a pull-up bar on top of bodyweight, and the Legacy Library's
 * `barbell-bench-press` is replaced by `bench-press`.
 */
export const testBundle: LibraryBundleV2 = {
  exercises: [
    {
      aliases: ["Flat press"],
      difficulty: "intermediate",
      equipment: ["bench", "barbell"],
      locales: {
        en: text("Bench Press"),
        uk: text("Жим лежачи"),
      },
      movement_patterns: ["push"],
      muscle_groups: ["chest"],
      secondary_muscle_groups: ["triceps"],
      slug: "bench-press",
      ...media("1"),
    },
    {
      aliases: [],
      difficulty: "beginner",
      equipment: ["dumbbell", "bench"],
      locales: { en: text("Incline Dumbbell Press") },
      movement_patterns: ["push"],
      muscle_groups: ["chest"],
      secondary_muscle_groups: ["shoulders"],
      slug: "incline-dumbbell-press",
      ...media("2"),
    },
    {
      aliases: [],
      difficulty: "intermediate",
      equipment: ["barbell"],
      locales: {
        en: text("Back Squat"),
        uk: text("Присідання зі штангою"),
      },
      movement_patterns: ["squat"],
      muscle_groups: ["quadriceps", "glutes"],
      secondary_muscle_groups: [],
      slug: "back-squat",
      ...media("3"),
    },
    {
      aliases: ["Chin over bar"],
      difficulty: "advanced",
      equipment: ["bodyweight", "pull_up_bar"],
      locales: { en: text("Pull-up") },
      movement_patterns: ["pull"],
      muscle_groups: ["back"],
      secondary_muscle_groups: ["biceps"],
      slug: "pull-up",
      ...media("4"),
    },
    {
      aliases: [],
      difficulty: "beginner",
      equipment: ["bodyweight"],
      locales: { en: text("Plank") },
      movement_patterns: ["core"],
      muscle_groups: ["core"],
      secondary_muscle_groups: [],
      slug: "plank",
      ...media("5"),
    },
  ],
  replaced_slugs: { "barbell-bench-press": "bench-press" },
  version: 2,
};

let loads: "fail" | "ok" = "ok";
let bundle: LibraryBundleV2 = testBundle;

// Reported the way agent/lib/library.ts reports, so a test mocking
// @fitme/observability/node sees the failed load.
const build = (): LibraryV2 =>
  createLibraryV2({
    load: async () =>
      loads === "fail"
        ? await Promise.reject(LIBRARY_OUTAGE)
        : await Promise.resolve(bundle),
    reportError: async (error) => {
      await reportError(error, { exercise_library: "library" });
    },
    supabaseUrl: "https://media.test",
  });

let library = build();

/**
 * The in-memory Library the tools get in tests, in place of the instance's
 * (`vi.mock("../agent/lib/library", …)`), over `testBundle`.
 */
export const testLibrary = {
  get: (): LibraryV2 => library,
  /**
   * A fresh Library, as a new instance has; with `loads: "fail"` every load
   * rejects with LIBRARY_OUTAGE (reported), so the Library is unavailable;
   * `bundle` serves another bundle than `testBundle`.
   */
  reset: (
    options: { bundle?: LibraryBundleV2; loads?: "fail" | "ok" } = {}
  ) => {
    loads = options.loads ?? "ok";
    bundle = options.bundle ?? testBundle;
    library = build();
  },
};
