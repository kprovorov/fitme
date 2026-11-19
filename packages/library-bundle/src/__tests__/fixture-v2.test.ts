import { describe, expect, it } from "vitest";

import v1Fixture from "../../../../apps/library/fixtures/library.json" with { type: "json" };
import fixture from "../../fixtures/library-v2.json" with { type: "json" };
import { LibraryBundleV2 } from "../schema-v2";
import type { BundleV2Exercise } from "../schema-v2";

const bundle = LibraryBundleV2.parse(fixture);

const some = (test: (exercise: BundleV2Exercise) => boolean) =>
  bundle.exercises.some(test);

describe("the committed v2 fixture", () => {
  it("passes the v2 schema", () => {
    expect(LibraryBundleV2.safeParse(fixture).error).toBeUndefined();
  });

  it("holds made-up Exercises only: every slug and English name says it's an example", () => {
    expect(
      bundle.exercises.filter(
        (exercise) =>
          !exercise.slug.startsWith("example-") ||
          !exercise.locales.en.name.startsWith("Example ")
      )
    ).toStrictEqual([]);
  });

  it("is in English and Ukrainian, with one Exercise left untranslated for the fallback", () => {
    expect({
      translated: some((exercise) => exercise.locales.uk !== undefined),
      untranslated: some((exercise) => exercise.locales.uk === undefined),
    }).toStrictEqual({ translated: true, untranslated: true });
  });

  it("uses every list field, in both languages", () => {
    const texts = (language: "en" | "uk") =>
      bundle.exercises.flatMap((exercise) => {
        const text = exercise.locales[language];

        return text ? [text] : [];
      });

    const textFields = (language: "en" | "uk") => ({
      benefits: texts(language).some((text) => text.benefits.length > 0),
      common_mistakes: texts(language).some(
        (text) => text.common_mistakes.length > 0
      ),
      steps: texts(language).some((text) => text.steps.length > 1),
      tags: texts(language).some((text) => text.tags.length > 0),
      use_cases: texts(language).some((text) => text.use_cases.length > 0),
    });

    const everyText = {
      benefits: true,
      common_mistakes: true,
      steps: true,
      tags: true,
      use_cases: true,
    };

    expect({
      aliases: some((exercise) => exercise.aliases.length > 0),
      difficulties: [
        ...new Set(bundle.exercises.map((exercise) => exercise.difficulty)),
      ].toSorted(),
      equipment: some((exercise) => exercise.equipment.length > 1),
      en: textFields("en"),
      movement_patterns: some(
        (exercise) => exercise.movement_patterns.length > 1
      ),
      muscle_groups: some((exercise) => exercise.muscle_groups.length > 1),
      secondary_muscle_groups: some(
        (exercise) => exercise.secondary_muscle_groups.length > 0
      ),
      uk: textFields("uk"),
    }).toStrictEqual({
      aliases: true,
      difficulties: ["advanced", "beginner", "intermediate"],
      equipment: true,
      en: everyText,
      movement_patterns: true,
      muscle_groups: true,
      secondary_muscle_groups: true,
      uk: everyText,
    });
  });

  it("replaces slugs the v1 fixture has", () => {
    const v1Slugs = new Set(
      v1Fixture.exercises.map((exercise) => exercise.slug)
    );

    const replaced = Object.keys(bundle.replaced_slugs ?? {});

    expect(replaced).not.toHaveLength(0);
    expect(replaced.filter((slug) => !v1Slugs.has(slug))).toStrictEqual([]);
  });
});
