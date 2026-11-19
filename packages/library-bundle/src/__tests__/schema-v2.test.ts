import { describe, expect, it } from "vitest";
import type { z } from "zod";

import type { BundleV2Exercise } from "../schema-v2";
import { LIBRARY_V2_BLOB, LibraryBundleV2 } from "../schema-v2";
import { LIBRARY_BLOB } from "../source";

const OID = "a".repeat(64);

/**
 * A fixture's fields over the schema's own, any of them replaced by any value
 * (invalid ones are the point), plus a field the schema doesn't have.
 */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- A fixture override carries invalid values on purpose: the schema under test is what parses them.
type Loose<Schema extends z.ZodType> = {
  [Key in keyof z.input<Schema>]?: unknown;
} & { stray?: unknown };

type ExerciseFields = Loose<typeof BundleV2Exercise>;

type BundleFields = Loose<typeof LibraryBundleV2>;

/** `object` without `field`. */
const without = <Fields extends object>(object: Fields, field: keyof Fields) =>
  Object.fromEntries(Object.entries(object).filter(([key]) => key !== field));

const text = (name: string) => ({
  benefits: ["Builds pressing strength"],
  common_mistakes: ["Bouncing the bar"],
  long_description: `${name}, explained at length.`,
  name,
  short_description: `${name} in a line.`,
  steps: ["Set up", "Press"],
  tags: ["strength"],
  use_cases: ["Upper body day"],
});

const exercise = (slug: string, overrides: ExerciseFields = {}) => ({
  aliases: [],
  difficulty: "intermediate",
  equipment: ["barbell", "bench"],
  locales: { en: text(slug) },
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  secondary_muscle_groups: ["triceps", "shoulders"],
  slug,
  thumbnail: { extension: "webp", oid: OID },
  video: { extension: "mp4", oid: OID },
  ...overrides,
});

const bundle = (overrides: BundleFields = {}) => ({
  exercises: [exercise("bench-press"), exercise("push-up")],
  version: 2,
  ...overrides,
});

/** Each issue as `path: message`, so a test names the field that failed. */
const issues = (input: unknown) => {
  const result = LibraryBundleV2.safeParse(input);

  return result.success
    ? []
    : result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      );
};

/** The bundle with its first Exercise's fields replaced. */
const withExercise = (overrides: ExerciseFields) =>
  bundle({
    exercises: [exercise("bench-press", overrides), exercise("push-up")],
  });

describe("the v2 bundle", () => {
  it("is published under its own blob name, beside library.json", () => {
    expect(LIBRARY_V2_BLOB).toBe("library-v2.json");
    expect(LIBRARY_V2_BLOB).not.toBe(LIBRARY_BLOB);
  });

  it("accepts a bundle with every field, a translation and a slug map", () => {
    const input = bundle({
      exercises: [
        exercise("bench-press", {
          aliases: ["flat bench"],
          locales: { en: text("Bench press"), uk: text("Жим лежачи") },
        }),
        exercise("pull-up", {
          equipment: ["bodyweight", "pull_up_bar"],
          movement_patterns: ["pull", "core"],
          muscle_groups: ["back"],
          secondary_muscle_groups: [],
        }),
      ],
      replaced_slugs: { "barbell-bench-press": "bench-press" },
    });

    expect(issues(input)).toStrictEqual([]);
    expect(LibraryBundleV2.parse(input)).toStrictEqual(input);
  });

  it("accepts empty lists where nothing is required", () => {
    const empty = {
      ...text("Bench press"),
      benefits: [],
      common_mistakes: [],
      tags: [],
      use_cases: [],
    };

    expect(issues(withExercise({ locales: { en: empty } }))).toStrictEqual([]);
  });

  it("refuses another version", () => {
    expect(issues(bundle({ version: 1 }))).toStrictEqual([
      "version: unsupported bundle version 1 (this schema reads version 2)",
    ]);
  });

  it("refuses an unknown field, on the bundle and on an Exercise", () => {
    expect(issues(bundle({ stray: [] }))).toHaveLength(1);
    expect(issues(withExercise({ stray: "old" }))).toHaveLength(1);
  });

  it.each([
    ["muscle_groups", ["abs"], 'unknown muscle group "abs"'],
    ["secondary_muscle_groups", ["lats"], 'unknown muscle group "lats"'],
    ["equipment", ["treadmill"], 'unknown Equipment "treadmill"'],
    ["movement_patterns", ["jump"], 'unknown movement pattern "jump"'],
  ])("refuses an unknown value in %s", (field, value, message) => {
    expect(issues(withExercise({ [field]: value }))).toStrictEqual([
      expect.stringContaining(`exercises.0.${field}.0: ${message}`),
    ]);
  });

  it("refuses an unknown difficulty", () => {
    expect(issues(withExercise({ difficulty: "expert" }))).toStrictEqual([
      expect.stringContaining(
        'exercises.0.difficulty: unknown difficulty "expert"'
      ),
    ]);
  });

  it.each([
    ["muscle_groups", ["chest", "chest"]],
    ["secondary_muscle_groups", ["triceps", "triceps"]],
    ["equipment", ["barbell", "barbell"]],
    ["movement_patterns", ["push", "push"]],
    ["aliases", ["flat bench", "flat bench"]],
  ])("refuses a repeat in %s", (field, value) => {
    expect(issues(withExercise({ [field]: value }))).toStrictEqual([
      expect.stringMatching(
        new RegExp(`^exercises\\.0\\.${field}: .* must not repeat$`, "u")
      ),
    ]);
  });

  it("refuses a muscle group that is both primary and secondary", () => {
    expect(
      issues(withExercise({ secondary_muscle_groups: ["triceps", "chest"] }))
    ).toStrictEqual([
      'exercises.0.secondary_muscle_groups.1: muscle group "chest" is already primary',
    ]);
  });

  it("refuses no primary muscle group and no Equipment", () => {
    expect(issues(withExercise({ muscle_groups: [] }))).toStrictEqual([
      "exercises.0.muscle_groups: must list at least one primary muscle group",
    ]);
    expect(issues(withExercise({ equipment: [] }))).toStrictEqual([
      "exercises.0.equipment: must list at least one Equipment (bodyweight when the body is the load)",
    ]);
  });

  it("takes one or two movement patterns, never none or three", () => {
    expect(issues(withExercise({ movement_patterns: [] }))).toStrictEqual([
      "exercises.0.movement_patterns: must list at least one movement pattern",
    ]);
    expect(
      issues(withExercise({ movement_patterns: ["push", "pull", "core"] }))
    ).toStrictEqual([
      "exercises.0.movement_patterns: must list at most two movement patterns",
    ]);
    expect(
      issues(withExercise({ movement_patterns: ["push", "core"] }))
    ).toStrictEqual([]);
  });

  it("requires every field it reads", () => {
    for (const field of Object.keys(
      exercise("bench-press")
    ) as (keyof ExerciseFields)[]) {
      const rest = without(exercise("bench-press"), field);

      expect(
        issues(bundle({ exercises: [rest] })),
        `${field} left out`
      ).toStrictEqual([expect.stringContaining(`exercises.0.${field}: `)]);
    }
  });

  it("requires English and refuses a locale that isn't an App language", () => {
    expect(
      issues(withExercise({ locales: { uk: text("Жим лежачи") } }))
    ).toStrictEqual([expect.stringContaining("exercises.0.locales.en: ")]);
    expect(
      issues(withExercise({ locales: { en: text("Bench"), ru: text("Жим") } }))
    ).toStrictEqual([
      expect.stringContaining('exercises.0.locales: unknown locale "ru"'),
    ]);
  });

  it("requires every text field of a locale, with something in it", () => {
    for (const field of Object.keys(text("Bench press")) as (keyof ReturnType<
      typeof text
    >)[]) {
      const rest = without(text("Bench press"), field);

      expect(
        issues(withExercise({ locales: { en: rest } })),
        `${field} left out`
      ).toStrictEqual([
        expect.stringContaining(`exercises.0.locales.en.${field}: `),
      ]);
    }

    expect(
      issues(withExercise({ locales: { en: { ...text("x"), name: "  " } } }))
    ).toStrictEqual(["exercises.0.locales.en.name: must not be blank"]);
    expect(
      issues(withExercise({ locales: { en: { ...text("x"), steps: [] } } }))
    ).toStrictEqual([
      "exercises.0.locales.en.steps: must list at least one step",
    ]);
    expect(
      issues(
        withExercise({ locales: { en: { ...text("x"), tags: ["a", "a"] } } })
      )
    ).toStrictEqual(["exercises.0.locales.en.tags: tags must not repeat"]);
  });

  it("refuses a bad slug and a repeated one", () => {
    expect(
      issues(bundle({ exercises: [exercise("Bench_Press")] }))
    ).toStrictEqual([
      expect.stringContaining("exercises.0.slug: must be an Exercise slug"),
    ]);
    expect(
      issues(
        bundle({
          exercises: [exercise("bench-press"), exercise("bench-press")],
        })
      )
    ).toStrictEqual(['exercises.1.slug: Exercise slug "bench-press" repeats']);
  });

  it("refuses a bad media reference", () => {
    expect(
      issues(withExercise({ thumbnail: { extension: "gif", oid: OID } }))
    ).toStrictEqual([
      expect.stringContaining("exercises.0.thumbnail.extension: "),
    ]);
    expect(
      issues(withExercise({ video: { extension: "mp4", oid: "abc" } }))
    ).toStrictEqual([
      "exercises.0.video.oid: must be a Git LFS object id (64 lowercase hex characters)",
    ]);
    expect(
      issues(
        withExercise({
          video: {
            extension: "mp4",
            oid: OID,
            url: "https://example.com/v.mp4",
          },
        })
      )
    ).toHaveLength(1);
  });

  it("refuses a replaced_slugs value that isn't one of the bundle's Exercises", () => {
    expect(
      issues(bundle({ replaced_slugs: { "barbell-row": "bent-over-row" } }))
    ).toStrictEqual([
      'replaced_slugs.barbell-row: replacement "bent-over-row" is not one of the bundle\'s Exercises',
    ]);
  });

  it("refuses a replaced_slugs key that is still one of the bundle's Exercises", () => {
    expect(
      issues(bundle({ replaced_slugs: { "push-up": "bench-press" } }))
    ).toStrictEqual([
      "replaced_slugs.push-up: \"push-up\" is one of the bundle's Exercises, so it can't be replaced",
    ]);
  });

  it("refuses a replaced_slugs key or value that isn't a slug", () => {
    expect(
      issues(bundle({ replaced_slugs: { "Old Slug": "bench-press" } }))
    ).toHaveLength(1);
    expect(
      issues(bundle({ replaced_slugs: { "old-slug": "Bench" } }))
    ).not.toStrictEqual([]);
  });
});
