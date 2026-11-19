import {
  appLanguages,
  defaultAppLanguage,
  difficulties,
  equipment,
  movementPatterns,
  muscleGroups,
} from "@fitme/core/models";
import type { AppLanguage } from "@fitme/core/models";
import { z } from "zod";

/**
 * The Library's bundle, format version 2 (ADR 0022): what `fitme-library`
 * publishes to the private Blob store under `LIBRARY_V2_BLOB`, beside the
 * Legacy Library's `library.json` (version 1, `./schema.ts`, left as it is).
 * It's the contract between the two repositories: every Exercise's metadata
 * and text, each media file as its Git LFS object id and extension (no URLs:
 * a reader resolves `<slug>/<oid>.<ext>` on the `library` bucket), and the old
 * → new slug map until the stored slugs are rewritten. No Covers. Anything
 * that doesn't match exactly fails.
 */
export const BUNDLE_V2_VERSION = 2;

/** The blob `fitme-library` publishes a version 2 bundle under. */
export const LIBRARY_V2_BLOB = "exercises.json";

/** The permanent Exercise identifier, e.g. `bench-press`. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** A Git LFS object id: the sha256 of the file's content. */
const OID = /^[0-9a-f]{64}$/u;

const SLUG_MESSAGE =
  "must be an Exercise slug: lowercase letters and digits, words joined by single hyphens";

const Slug = z.string().regex(SLUG, SLUG_MESSAGE);

/** One of a fixed `@fitme/core` list, naming the list in its error. */
const known = <const Value extends string>(
  values: readonly [Value, ...Value[]],
  noun: string
) =>
  z.enum(values, {
    error: (issue) =>
      `unknown ${noun} ${JSON.stringify(issue.input)} (known: ${values.join(", ")})`,
  });

const noRepeats = <Value>(values: Value[]) =>
  new Set(values).size === values.length;

/** A list of `item`, no value repeated. */
const distinct = <Item extends z.ZodType>(item: Item, noun: string) =>
  z.array(item).refine(noRepeats, { error: `${noun} must not repeat` });

const MuscleGroup = known(muscleGroups, "muscle group");

const media = <const Extension extends string>(
  extensions: readonly [Extension, ...Extension[]]
) =>
  z.strictObject({
    extension: z.enum(extensions),
    oid: z
      .string()
      .regex(OID, "must be a Git LFS object id (64 lowercase hex characters)"),
  });

/** Text that says something: not empty, not only whitespace. */
const Text = z.string().trim().min(1, { error: "must not be blank" });

/** An Exercise's text in one App language. */
const ExerciseTextSchema = z.strictObject({
  benefits: distinct(Text, "benefits"),
  common_mistakes: distinct(Text, "common mistakes"),
  long_description: Text,
  name: Text,
  short_description: Text,
  steps: distinct(Text, "steps").min(1, {
    error: "must list at least one step",
  }),
  tags: distinct(Text, "tags"),
  use_cases: distinct(Text, "use cases"),
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
  // SAFETY: The default language is en; every other App language is mapped
  // to an optional ExerciseText schema by translatedLanguages above.
  {
    [defaultAppLanguage]: ExerciseTextSchema,
    ...Object.fromEntries(
      translatedLanguages.map((language) => [
        language,
        ExerciseTextSchema.optional(),
      ])
    ),
  } as { en: typeof ExerciseTextSchema } & Record<
    TranslatedLanguage,
    z.ZodOptional<typeof ExerciseTextSchema>
  >,
  {
    error: (issue) =>
      issue.code === "unrecognized_keys"
        ? `unknown locale ${issue.keys.map((key) => JSON.stringify(key)).join(", ")} (known: ${appLanguages.join(", ")})`
        : undefined,
  }
);

const BundleV2ExerciseSchema = z
  .strictObject({
    /** Other English names the Exercise goes by, searched but never shown. */
    aliases: distinct(Text, "aliases"),
    difficulty: known(difficulties, "difficulty"),
    /** The gear it needs, at least one: `bodyweight` when the body is the load. */
    equipment: distinct(known(equipment, "Equipment"), "Equipment").min(1, {
      error:
        "must list at least one Equipment (bodyweight when the body is the load)",
    }),
    locales: Locales,
    movement_patterns: distinct(
      known(movementPatterns, "movement pattern"),
      "movement patterns"
    )
      .min(1, { error: "must list at least one movement pattern" })
      .max(2, { error: "must list at most two movement patterns" }),
    /** What it mainly trains, at least one. */
    muscle_groups: distinct(MuscleGroup, "muscle groups").min(1, {
      error: "must list at least one primary muscle group",
    }),
    /** What it trains besides, none of them primary. */
    secondary_muscle_groups: distinct(MuscleGroup, "secondary muscle groups"),
    slug: Slug,
    thumbnail: media(["jpg", "png", "webp"]),
    video: media(["mp4"]),
  })
  .superRefine((exercise, ctx) => {
    const primary = new Set(exercise.muscle_groups);

    for (const [index, group] of exercise.secondary_muscle_groups.entries()) {
      if (primary.has(group)) {
        ctx.addIssue({
          code: "custom",
          message: `muscle group ${JSON.stringify(group)} is already primary`,
          path: ["secondary_muscle_groups", index],
        });
      }
    }
  });

const LibraryBundleV2Schema = z
  .strictObject({
    exercises: z.array(BundleV2ExerciseSchema),
    /**
     * Legacy Library slug → the Exercise replacing it, until the stored slugs
     * are rewritten (ADR 0022). Each value is one of the bundle's slugs, and
     * no key is: a slug the bundle has is never replaced.
     */
    replaced_slugs: z
      .record(z.string().regex(SLUG, SLUG_MESSAGE), Slug)
      .optional(),
    version: z.literal(BUNDLE_V2_VERSION, {
      error: (issue) =>
        `unsupported bundle version ${JSON.stringify(issue.input)} (this schema reads version ${BUNDLE_V2_VERSION})`,
    }),
  })
  .superRefine((bundle, ctx) => {
    const slugs = new Set<string>();

    for (const [index, { slug }] of bundle.exercises.entries()) {
      if (slugs.has(slug)) {
        ctx.addIssue({
          code: "custom",
          message: `Exercise slug ${JSON.stringify(slug)} repeats`,
          path: ["exercises", index, "slug"],
        });
      }

      slugs.add(slug);
    }

    for (const [old, replacement] of Object.entries(
      bundle.replaced_slugs ?? {}
    )) {
      if (slugs.has(old)) {
        ctx.addIssue({
          code: "custom",
          message: `${JSON.stringify(old)} is one of the bundle's Exercises, so it can't be replaced`,
          path: ["replaced_slugs", old],
        });
      }

      if (!slugs.has(replacement)) {
        ctx.addIssue({
          code: "custom",
          message: `replacement ${JSON.stringify(replacement)} is not one of the bundle's Exercises`,
          path: ["replaced_slugs", old],
        });
      }
    }
  });

export {
  BundleV2ExerciseSchema as BundleV2Exercise,
  ExerciseTextSchema as BundleV2ExerciseText,
  LibraryBundleV2Schema as LibraryBundleV2,
};

export type BundleV2Exercise = z.infer<typeof BundleV2ExerciseSchema>;

export type BundleV2ExerciseText = z.infer<typeof ExerciseTextSchema>;

export type LibraryBundleV2 = z.infer<typeof LibraryBundleV2Schema>;

export type BundleV2Media = z.infer<typeof BundleV2ExerciseSchema>[
  | "thumbnail"
  | "video"];
