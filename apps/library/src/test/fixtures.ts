import type { BundleCover, BundleExercise, LibraryBundle } from "../bundle";

export const fakeOid = (char: string) => char.repeat(64);

/** An Exercise as `library.json` holds it. */
export const libraryExercise = (
  slug: string,
  name: string,
  muscleGroups: BundleExercise["muscle_groups"] = ["chest", "triceps"]
): BundleExercise => ({
  locales: {
    en: {
      description: `${name} is a compound pushing movement.\n`,
      instructions: "1. Lie on the bench.\n2. Press.\n",
      name,
    },
  },
  muscle_groups: muscleGroups,
  slug,
  thumbnail: { extension: "png", oid: fakeOid("a") },
  video: { extension: "mp4", oid: fakeOid("b") },
});

/** `exercise` with a made-up Ukrainian translation named `name`. */
export const inUkrainian = (
  exercise: BundleExercise,
  name: string
): BundleExercise => ({
  ...exercise,
  locales: {
    ...exercise.locales,
    uk: {
      description: `${name} — вигадана вправа для тестів.\n`,
      instructions: "1. Ляжте на лаву.\n2. Тисніть.\n",
      name,
    },
  },
});

/** A Cover as `library.json` holds it. */
export const libraryCover = (
  id: string,
  muscleGroups: BundleCover["muscle_groups"] = ["chest"]
): BundleCover => ({
  id,
  image: { extension: "jpg", oid: fakeOid("c") },
  muscle_groups: muscleGroups,
});

/** A version 1 `library.json` holding `exercises` and, when given, `covers`. */
export const libraryBundle = (
  exercises: BundleExercise[],
  covers?: BundleCover[]
): LibraryBundle => ({
  ...(covers && { covers }),
  exercises,
  version: 1,
});
