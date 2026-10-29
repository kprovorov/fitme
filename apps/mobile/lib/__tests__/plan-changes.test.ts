import { createI18n } from "@fitme/i18n";
import { describe, expect, it } from "@jest/globals";
import {
  countPlanChanges,
  formatPlanChange,
  type PlanUpdateChange,
  planUpdateSlugs,
} from "../plan-changes";

const NAMES: Record<string, string> = {
  "bench-press": "Bench Press",
  "dumbbell-press": "Dumbbell Press",
  squat: "Squat",
};

const nameOf = (slug: string) => NAMES[slug] ?? `<${slug}>`;

const i18n = createI18n("en");

describe("formatPlanChange", () => {
  it("lists a replacement's sets in kilograms, each Exercise by name", () => {
    expect(
      formatPlanChange(
        {
          exercise_slug: "dumbbell-press",
          kind: "replace_exercise",
          replaced_exercise_slug: "bench-press",
          sets: [
            { reps: 8, weight: 30 },
            { reps: 6, weight: 32.5 },
          ],
        },
        "kg",
        nameOf,
        i18n
      )
    ).toEqual({
      accessibilityLabel:
        "Replace Bench Press with Dumbbell Press: 8 reps at 30 kilograms, 6 reps at 32.5 kilograms",
      text: "Replace Bench Press with Dumbbell Press · 8×30, 6×32.5 kg",
    });
  });

  it("says pounds for lbs", () => {
    expect(
      formatPlanChange(
        {
          exercise_slug: "squat",
          kind: "add_exercise",
          sets: [{ reps: 1, weight: 225 }],
        },
        "lbs",
        nameOf,
        i18n
      )
    ).toEqual({
      accessibilityLabel: "Add Squat: 1 rep at 225 pounds",
      text: "Add Squat · 1×225 lbs",
    });
  });

  it("counts added sets, singular and plural", () => {
    const addSets = (count: number): PlanUpdateChange => ({
      exercise_slug: "squat",
      kind: "add_sets",
      sets: Array.from({ length: count }, () => ({ reps: 5, weight: 100 })),
    });
    expect(formatPlanChange(addSets(1), "kg", nameOf, i18n).text).toBe(
      "Add 1 set to Squat · 5×100 kg"
    );
    expect(formatPlanChange(addSets(2), "kg", nameOf, i18n).text).toBe(
      "Add 2 sets to Squat · 5×100, 5×100 kg"
    );
  });

  it("names only the Exercise for a removal", () => {
    expect(
      formatPlanChange(
        { exercise_slug: "bench-press", kind: "remove_exercise" },
        "lbs",
        nameOf,
        i18n
      )
    ).toEqual({
      accessibilityLabel: "Remove Bench Press",
      text: "Remove Bench Press",
    });
  });

  it("shows a bodyweight set's weight as 0", () => {
    expect(
      formatPlanChange(
        {
          exercise_slug: "squat",
          kind: "add_exercise",
          sets: [{ reps: 12, weight: 0 }],
        },
        "kg",
        nameOf,
        i18n
      ).text
    ).toBe("Add Squat · 12×0 kg");
  });

  it("writes numbers, units and counts in the App language", () => {
    const uk = createI18n("uk");
    expect(
      formatPlanChange(
        {
          exercise_slug: "squat",
          kind: "add_sets",
          sets: [
            { reps: 5, weight: 62.5 },
            { reps: 1, weight: 62.5 },
          ],
        },
        "kg",
        nameOf,
        uk
      )
    ).toEqual({
      accessibilityLabel:
        "Add 2 підходи to Squat: 5 повторень at 62,5 кілограма, 1 повторення at 62,5 кілограма",
      text: "Add 2 підходи to Squat · 5×62,5, 1×62,5 кг",
    });
  });
});

describe("planUpdateSlugs", () => {
  it("lists every Exercise the changes name, a replacement's both", () => {
    expect(
      planUpdateSlugs([
        {
          exercise_slug: "dumbbell-press",
          kind: "replace_exercise",
          replaced_exercise_slug: "bench-press",
          sets: [],
        },
        { exercise_slug: "squat", kind: "remove_exercise" },
      ])
    ).toEqual(["bench-press", "dumbbell-press", "squat"]);
  });
});

describe("countPlanChanges", () => {
  it("counts each kind, zero included", () => {
    expect(
      countPlanChanges([
        { exercise_slug: "bench-press", kind: "remove_exercise" },
        { exercise_slug: "squat", kind: "remove_exercise" },
        {
          exercise_slug: "squat",
          kind: "add_sets",
          sets: [{ reps: 5, weight: 100 }],
        },
      ])
    ).toEqual({
      add_exercise: 0,
      add_sets: 1,
      remove_exercise: 2,
      replace_exercise: 0,
    });
  });
});
