import type { BundleExercise, LibraryBundle } from "../bundle";

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

/** A version 1 `library.json` holding `exercises`. */
export const libraryBundle = (exercises: BundleExercise[]): LibraryBundle => ({
  exercises,
  version: 1,
});
