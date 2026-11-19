import type { MuscleGroup } from "@fitme/core/models";
import type { LibraryBundleV2 } from "@fitme/library-bundle/v2";
import { createLibraryV2 } from "@fitme/library-bundle/v2/library";

import { withRetryInterval } from "../exercise-library.js";

/** The Supabase project the test Library's media URLs are on. */
export const TEST_SUPABASE_URL = "https://project.supabase.co";

const OID = "a".repeat(64);

const text = (name: string) => ({
  benefits: [`${name} benefit`],
  common_mistakes: [`${name} mistake`],
  long_description: `${name}, at length.`,
  name,
  short_description: `${name}, briefly.`,
  steps: [`${name} step one`, `${name} step two`],
  tags: [`${name} tag`],
  use_cases: [`${name} use case`],
});

const media = {
  thumbnail: { extension: "webp", oid: OID },
  video: { extension: "mp4", oid: OID },
} as const;

/**
 * Three made-up Exercises: a bench press and a squat in English and
 * Ukrainian, a plank in English only, and one replaced slug.
 */
export const TEST_EXERCISE_BUNDLE: LibraryBundleV2 = {
  exercises: [
    {
      aliases: ["Flat press"],
      difficulty: "intermediate",
      equipment: ["bench", "barbell"],
      locales: {
        en: text("Bench press"),
        uk: text("Жим лежачи"),
      },
      movement_patterns: ["push"],
      muscle_groups: ["chest"],
      secondary_muscle_groups: ["triceps", "shoulders"],
      slug: "barbell-bench-press",
      ...media,
    },
    {
      aliases: [],
      difficulty: "beginner",
      equipment: ["kettlebell"],
      locales: {
        en: text("Goblet squat"),
        uk: text("Присідання з гирею"),
      },
      movement_patterns: ["squat"],
      muscle_groups: ["quadriceps", "glutes"],
      secondary_muscle_groups: ["core"],
      slug: "goblet-squat",
      ...media,
    },
    {
      aliases: [],
      difficulty: "beginner",
      equipment: ["bodyweight"],
      locales: { en: text("Plank") },
      movement_patterns: ["core"],
      muscle_groups: ["core"],
      secondary_muscle_groups: ["shoulders"],
      slug: "plank",
      ...media,
    },
  ],
  replaced_slugs: { "bench-press": "barbell-bench-press" },
  version: 2,
};

/** A made-up Exercise the test bundle can carry, by slug, training `muscleGroups` (quadriceps unless told otherwise). */
export const bundleExercise = (
  slug: string,
  muscleGroups: readonly MuscleGroup[] = ["quadriceps"]
): LibraryBundleV2["exercises"][number] => ({
  aliases: [],
  difficulty: "beginner",
  equipment: ["bodyweight"],
  locales: { en: text(slug) },
  movement_patterns: ["squat"],
  muscle_groups: [...muscleGroups],
  secondary_muscle_groups: [],
  slug,
  ...media,
});

/**
 * `TEST_EXERCISE_BUNDLE` with `exercises` added (one already in it is left
 * as it is), and its replaced slug: the bundle a write test's slugs are
 * checked against.
 */
export const bundleWith = (
  exercises: readonly LibraryBundleV2["exercises"][number][]
): LibraryBundleV2 => {
  const slugs = new Set(TEST_EXERCISE_BUNDLE.exercises.map((e) => e.slug));

  return {
    ...TEST_EXERCISE_BUNDLE,
    exercises: [
      ...TEST_EXERCISE_BUNDLE.exercises,
      ...exercises.filter((exercise) => !slugs.has(exercise.slug)),
    ],
  };
};

/** How a test's new Library loads its bundle. */
export type ExerciseLibraryLoads = "ok" | "fail";

/** The error a failing test bundle load rejects with. */
export const exerciseLibraryOutage = () =>
  new Error("Blob is unavailable (v2)");

/**
 * The new Library over `bundle` as the app wraps it (a failed load waits a
 * minute before the next), on a clock tests move through `clock.now`; its
 * loads counted, every one failing with `loading: "fail"`.
 */
export const testExerciseLibrary = ({
  bundle = TEST_EXERCISE_BUNDLE,
  loading = "ok",
  reportError,
}: {
  bundle?: LibraryBundleV2;
  loading?: ExerciseLibraryLoads;
  reportError: (error: Error) => Promise<void>;
}) => {
  const clock = { now: 0 };
  const state = { loads: 0, outage: exerciseLibraryOutage() };

  const loaded = createLibraryV2({
    load: () => {
      state.loads += 1;

      return loading === "fail"
        ? Promise.reject(state.outage)
        : Promise.resolve(bundle);
    },
    reportError,
    supabaseUrl: TEST_SUPABASE_URL,
  });

  const library = withRetryInterval(loaded, { now: () => clock.now });

  return { clock, library, state };
};
