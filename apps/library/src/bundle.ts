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
 * every Exercise's metadata and text, every Cover (ADR 0014; optional, so a
 * bundle without Covers stays valid), and each media file as its Git LFS
 * object id and extension. No URLs: the API resolves them on its Supabase
 * project. Anything that doesn't match exactly fails the build.
 */
export const BUNDLE_VERSION = 1;

/** The permanent Exercise identifier, e.g. `bench-press`. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** A Git LFS object id: the sha256 of the file's content. */
const OID = /^[0-9a-f]{64}$/;
/** The permanent Cover identifier: a lowercase uuid. */
const COVER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
type TranslatedLanguage = Exclude<AppLanguage, "en">;

const translatedLanguages = appLanguages.filter(
  (language): language is TranslatedLanguage => language !== defaultAppLanguage
);

/**
 * Every Exercise's text per App language (`@fitme/core`): English required,
 * every other App language optional. A locale that isn't one fails.
 */
const Locales = z.strictObject(
  {
    [defaultAppLanguage]: ExerciseText,
    ...Object.fromEntries(
      translatedLanguages.map((language) => [language, ExerciseText.optional()])
    ),
  } as { en: typeof ExerciseText } & {
    [Language in TranslatedLanguage]: z.ZodOptional<typeof ExerciseText>;
  },
  {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `unknown locale ${issue.keys.map((key) => JSON.stringify(key)).join(", ")} (known: ${appLanguages.join(", ")})`
        : undefined,
  }
);

/** At least one muscle group from `@fitme/core`, none repeated. */
const MuscleGroups = z
  .array(KnownMuscleGroup)
  .nonempty()
  .refine((groups) => new Set(groups).size === groups.length, {
    error: "muscle groups must not repeat",
  });

const image = media(["jpg", "png", "webp"]);

export const BundleExercise = z.strictObject({
  locales: Locales,
  muscle_groups: MuscleGroups,
  slug: z
    .string()
    .regex(
      SLUG,
      "must be an Exercise slug: lowercase letters and digits, words joined by single hyphens"
    ),
  thumbnail: image,
  video: media(["mp4"]),
});

/**
 * A Cover: a photo a Workout's card shows, tagged with the muscle groups it
 * suits. Decorative, so no locales and no alt text.
 */
export const BundleCover = z.strictObject({
  id: z.string().regex(COVER_ID, "must be a lowercase uuid"),
  image,
  muscle_groups: MuscleGroups,
});

/** Adds an issue at `<index>.<field>` for every value of `field` seen before. */
const unique =
  <Item, Field extends keyof Item & string>(
    field: Field,
    message: (value: Item[Field]) => string
  ) =>
  (items: Item[], ctx: z.RefinementCtx) => {
    const seen = new Set<Item[Field]>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item[field])) {
        ctx.addIssue({
          code: "custom",
          message: message(item[field]),
          path: [index, field],
        });
      }
      seen.add(item[field]);
    }
  };

export const LibraryBundle = z.strictObject({
  covers: z
    .array(BundleCover)
    .superRefine(unique("id", (id) => `Cover id ${JSON.stringify(id)} repeats`))
    .optional(),
  exercises: z
    .array(BundleExercise)
    .superRefine(
      unique("slug", (slug) => `Exercise slug ${JSON.stringify(slug)} repeats`)
    ),
  version: z.literal(BUNDLE_VERSION, {
    error: (issue) =>
      `unsupported bundle version ${JSON.stringify(issue.input)} (this build reads version ${BUNDLE_VERSION})`,
  }),
});

export type BundleCover = z.infer<typeof BundleCover>;
export type BundleExercise = z.infer<typeof BundleExercise>;
export type LibraryBundle = z.infer<typeof LibraryBundle>;
export type BundleMedia =
  | BundleExercise["thumbnail" | "video"]
  | BundleCover["image"];
