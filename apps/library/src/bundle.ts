import {
  type AppLanguage,
  appLanguages,
  defaultAppLanguage,
  muscleGroups,
} from "@fitme/core/models";
import { z } from "zod";

/**
 * `library.json`, the bundle `fitme-exercises` publishes and the API is built
 * from (format version 1). It's the contract between the two repositories:
 * every Exercise's metadata and text, and each media file as its Git LFS
 * object id and extension. No URLs: the API resolves them on its Supabase
 * project. Anything that doesn't match exactly fails the build.
 */
export const BUNDLE_VERSION = 1;

/** The permanent Exercise identifier, e.g. `bench-press`. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A Git LFS object id: the sha256 of the file's content. */
const OID = /^[0-9a-f]{64}$/;

const KnownMuscleGroup = z.enum(muscleGroups, {
  error: (issue) =>
    `unknown muscle group ${JSON.stringify(issue.input)} (known: ${muscleGroups.join(", ")})`,
});

const media = <const Extension extends string>(
  extensions: readonly [Extension, ...Extension[]]
) =>
  z.strictObject({
    extension: z.enum(extensions),
    oid: z
      .string()
      .regex(OID, "must be a Git LFS object id (64 lowercase hex characters)"),
  });

/** An Exercise's text in one App language. */
const ExerciseText = z.strictObject({
  description: z.string(),
  instructions: z.string(),
  name: z.string().trim().min(1),
});

/** The App languages an Exercise may be translated into: every one but English. */
export type TranslatedLanguage = Exclude<AppLanguage, "en">;

/**
 * Every Exercise's text per App language (`@fitme/core`): English required,
 * every other App language optional. A locale that isn't one fails.
 */
const Locales = z.strictObject(
  Object.fromEntries(
    appLanguages.map((language) => [
      language,
      language === defaultAppLanguage ? ExerciseText : ExerciseText.optional(),
    ])
  ) as { en: typeof ExerciseText } & {
    [Language in TranslatedLanguage]: z.ZodOptional<typeof ExerciseText>;
  },
  {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `unknown locale ${issue.keys.map((key) => JSON.stringify(key)).join(", ")} (known: ${appLanguages.join(", ")})`
        : undefined,
  }
);

export const BundleExercise = z.strictObject({
  locales: Locales,
  muscle_groups: z
    .array(KnownMuscleGroup)
    .nonempty()
    .refine((groups) => new Set(groups).size === groups.length, {
      error: "muscle groups must not repeat",
    }),
  slug: z
    .string()
    .regex(
      SLUG,
      "must be an Exercise slug: lowercase letters and digits, words joined by single hyphens"
    ),
  thumbnail: media(["jpg", "png", "webp"]),
  video: media(["mp4"]),
});

export const LibraryBundle = z.strictObject({
  exercises: z.array(BundleExercise).superRefine((exercises, ctx) => {
    const seen = new Set<string>();
    for (const [index, { slug }] of exercises.entries()) {
      if (seen.has(slug)) {
        ctx.addIssue({
          code: "custom",
          message: `Exercise slug ${JSON.stringify(slug)} repeats`,
          path: [index, "slug"],
        });
      }
      seen.add(slug);
    }
  }),
  version: z.literal(BUNDLE_VERSION, {
    error: (issue) =>
      `unsupported bundle version ${JSON.stringify(issue.input)} (this build reads version ${BUNDLE_VERSION})`,
  }),
});

export type BundleExercise = z.infer<typeof BundleExercise>;
export type LibraryBundle = z.infer<typeof LibraryBundle>;
export type BundleExerciseText = z.infer<typeof ExerciseText>;
export type BundleMedia = BundleExercise["thumbnail" | "video"];
