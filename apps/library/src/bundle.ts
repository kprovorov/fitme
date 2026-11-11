import {
  appLanguages,
  defaultAppLanguage,
  equipment,
  muscleGroups,
} from "@fitme/core/models";
import type { AppLanguage } from "@fitme/core/models";
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
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A Git LFS object id: the sha256 of the file's content. */
const OID = /^[0-9a-f]{64}$/u;

/** The permanent Cover identifier: a lowercase uuid. */
const COVER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const KnownMuscleGroup = z.enum(muscleGroups, {
  error: (issue) =>
    `unknown muscle group ${JSON.stringify(issue.input)} (known: ${muscleGroups.join(", ")})`,
});

const KnownEquipment = z.enum(equipment, {
  error: (issue) =>
    `unknown Equipment ${JSON.stringify(issue.input)} (known: ${equipment.join(", ")})`,
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
  // SAFETY: The default language is en; every other app language is mapped
  // to an optional ExerciseText schema by translatedLanguages above.
  {
    [defaultAppLanguage]: ExerciseText,
    ...Object.fromEntries(
      translatedLanguages.map((language) => [language, ExerciseText.optional()])
    ),
  } as { en: typeof ExerciseText } & Record<
    TranslatedLanguage,
    z.ZodOptional<typeof ExerciseText>
  >,
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

/**
 * The Equipment an Exercise needs, from `@fitme/core`, none repeated, at least
 * one: an Exercise that needs no gear lists `bodyweight`.
 */
const EquipmentList = z
  .array(KnownEquipment, {
    error: (issue) =>
      issue.input === undefined
        ? "required: list the Equipment the Exercise needs (bodyweight when it needs none)"
        : undefined,
  })
  .min(1, {
    error:
      "must list at least one Equipment (bodyweight when the Exercise needs none)",
  })
  .refine((needed) => new Set(needed).size === needed.length, {
    error: "Equipment must not repeat",
  });

const image = media(["jpg", "png", "webp"]);

const BundleExerciseSchema = z.strictObject({
  equipment: EquipmentList,
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
const BundleCoverSchema = z.strictObject({
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

const LibraryBundleSchema = z.strictObject({
  covers: z
    .array(BundleCoverSchema)
    .superRefine(unique("id", (id) => `Cover id ${JSON.stringify(id)} repeats`))
    .optional(),
  exercises: z
    .array(BundleExerciseSchema)
    .superRefine(
      unique("slug", (slug) => `Exercise slug ${JSON.stringify(slug)} repeats`)
    ),
  version: z.literal(BUNDLE_VERSION, {
    error: (issue) =>
      `unsupported bundle version ${JSON.stringify(issue.input)} (this build reads version ${BUNDLE_VERSION})`,
  }),
});

export {
  BundleCoverSchema as BundleCover,
  BundleExerciseSchema as BundleExercise,
  LibraryBundleSchema as LibraryBundle,
};

export type BundleCover = z.infer<typeof BundleCoverSchema>;

export type BundleExercise = z.infer<typeof BundleExerciseSchema>;

export type LibraryBundle = z.infer<typeof LibraryBundleSchema>;

export type BundleMedia =
  | BundleExercise["thumbnail" | "video"]
  | BundleCover["image"];
