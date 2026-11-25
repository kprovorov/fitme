import { createI18n } from "@fitme/i18n";
import { describe, expect, it } from "@jest/globals";

import {
  countPlanChanges,
  formatPlanChange,
  formatSetRemoval,
  hasPlanUpdate,
  planUpdateSlugs,
  setRemovalsOf,
} from "../plan-changes";
import type { PlanUpdate, PlanUpdateChange } from "../plan-changes";

const NAMES: Record<string, string> = {
  "bench-press": "Bench Press",
  "dumbbell-press": "Dumbbell Press",
  squat: "Squat",
};

const nameOf = (slug: string) => NAMES[slug] ?? `<${slug}>`;

const i18n = createI18n("en");

const planUpdate = (parts: Partial<PlanUpdate>): PlanUpdate => ({
  changes: [],
  plan: null,
  set_removals: [],
  weight_unit: "kg",
  workout: null,
  ...parts,
});

const REMOVAL = {
  exercise_slug: "squat",
  sets: [{ reps: 10, weight: 40 }],
};

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
      text: "Replace Bench Press with Dumbbell Press · 8×30, 6×32.5\u00A0kg",
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
      text: "Add Squat · 1×225\u00A0lbs",
    });
  });

  it("counts added sets, singular and plural", () => {
    const addSets = (count: number): PlanUpdateChange => ({
      exercise_slug: "squat",
      kind: "add_sets",
      sets: Array.from({ length: count }, () => ({ reps: 5, weight: 100 })),
    });

    expect(formatPlanChange(addSets(1), "kg", nameOf, i18n).text).toBe(
      "Add 1 set to Squat · 5×100\u00A0kg"
    );
    expect(formatPlanChange(addSets(2), "kg", nameOf, i18n).text).toBe(
      "Add 2 sets to Squat · 5×100, 5×100\u00A0kg"
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
    ).toBe("Add Squat · 12×0\u00A0kg");
  });
});

describe("formatPlanChange in Ukrainian", () => {
  const uk = createI18n("uk");

  it("replaces an Exercise, numbers and units as Ukrainian writes them", () => {
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
        uk
      )
    ).toEqual({
      accessibilityLabel:
        "Замінити «Bench Press» на «Dumbbell Press»: 8 повторень по 30 кілограмів, 6 повторень по 32,5 кілограма",
      text: "Замінити «Bench Press» на «Dumbbell Press» · 8×30, 6×32,5\u00A0кг",
    });
  });

  it("adds an Exercise, in pounds for lbs", () => {
    expect(
      formatPlanChange(
        {
          exercise_slug: "squat",
          kind: "add_exercise",
          sets: [{ reps: 1, weight: 225 }],
        },
        "lbs",
        nameOf,
        uk
      )
    ).toEqual({
      accessibilityLabel: "Додати «Squat»: 1 повторення по 225 фунтів",
      text: "Додати «Squat» · 1×225\u00A0фунт",
    });
  });

  it("removes an Exercise", () => {
    expect(
      formatPlanChange(
        { exercise_slug: "bench-press", kind: "remove_exercise" },
        "kg",
        nameOf,
        uk
      )
    ).toEqual({
      accessibilityLabel: "Видалити «Bench Press»",
      text: "Видалити «Bench Press»",
    });
  });

  it.each([
    [1, "Додати 1 підхід до «Squat»"],
    [2, "Додати 2 підходи до «Squat»"],
    [5, "Додати 5 підходів до «Squat»"],
  ])("adds %i set(s) with Ukrainian's plural form", (count, change) => {
    const line = formatPlanChange(
      {
        exercise_slug: "squat",
        kind: "add_sets",
        sets: Array.from({ length: count }, () => ({ reps: 5, weight: 62.5 })),
      },
      "kg",
      nameOf,
      uk
    );

    expect(line.text).toBe(
      `${change} · ${Array.from({ length: count }, () => "5×62,5").join(", ")}\u00A0кг`
    );
    expect(line.accessibilityLabel).toBe(
      `${change}: ${Array.from({ length: count }, () => "5 повторень по 62,5 кілограма").join(", ")}`
    );
  });
});

describe("formatSetRemoval", () => {
  const uk = createI18n("uk");

  const removal = (count: number) => ({
    exercise_slug: "squat",
    sets: Array.from({ length: count }, () => ({ reps: 10, weight: 42.5 })),
  });

  it.each([
    [
      1,
      "Remove 1 set from Squat · 10×42.5\u00A0lbs",
      "Remove 1 set from Squat: 10 reps at 42.5 pounds",
    ],
    [
      2,
      "Remove 2 sets from Squat · 10×42.5, 10×42.5\u00A0lbs",
      "Remove 2 sets from Squat: 10 reps at 42.5 pounds, 10 reps at 42.5 pounds",
    ],
  ])(
    "names the %i Plan set(s) that go, in the unit",
    (count, text, accessibilityLabel) => {
      expect(formatSetRemoval(removal(count), "lbs", nameOf, i18n)).toEqual({
        accessibilityLabel,
        text,
      });
    }
  );

  it.each([
    [1, "Видалити 1 підхід із «Squat»"],
    [2, "Видалити 2 підходи із «Squat»"],
    [5, "Видалити 5 підходів із «Squat»"],
  ])("removes %i set(s) with Ukrainian's plural form", (count, change) => {
    const line = formatSetRemoval(removal(count), "kg", nameOf, uk);

    expect(line.text).toBe(
      `${change} · ${Array.from({ length: count }, () => "10×42,5").join(", ")}\u00A0кг`
    );
    expect(line.accessibilityLabel).toBe(
      `${change}: ${Array.from({ length: count }, () => "10 повторень по 42,5 кілограма").join(", ")}`
    );
  });
});

describe("an answer without set_removals", () => {
  it("counts as none", () => {
    const { set_removals: _omitted, ...answer } = planUpdate({});
    const old = answer as PlanUpdate;

    expect(setRemovalsOf(old)).toEqual([]);
    expect(hasPlanUpdate(old)).toBe(false);
    expect(planUpdateSlugs(old)).toEqual([]);
    expect(countPlanChanges(old).remove_sets).toBe(0);
  });
});

describe("hasPlanUpdate", () => {
  it("asks for changes or set removals, and for neither doesn't", () => {
    expect(hasPlanUpdate(planUpdate({}))).toBe(false);
    expect(hasPlanUpdate(planUpdate({ set_removals: [REMOVAL] }))).toBe(true);
    expect(
      hasPlanUpdate(
        planUpdate({
          changes: [{ exercise_slug: "squat", kind: "remove_exercise" }],
        })
      )
    ).toBe(true);
  });
});

describe("planUpdateSlugs", () => {
  it("lists every Exercise it names, a replacement's both and a set removal's", () => {
    expect(
      planUpdateSlugs(
        planUpdate({
          changes: [
            {
              exercise_slug: "dumbbell-press",
              kind: "replace_exercise",
              replaced_exercise_slug: "bench-press",
              sets: [],
            },
            { exercise_slug: "squat", kind: "remove_exercise" },
          ],
          set_removals: [{ ...REMOVAL, exercise_slug: "lunge" }],
        })
      )
    ).toEqual(["bench-press", "dumbbell-press", "squat", "lunge"]);
  });
});

describe("countPlanChanges", () => {
  it("counts each kind, zero included", () => {
    expect(
      countPlanChanges(
        planUpdate({
          changes: [
            { exercise_slug: "bench-press", kind: "remove_exercise" },
            { exercise_slug: "squat", kind: "remove_exercise" },
            {
              exercise_slug: "squat",
              kind: "add_sets",
              sets: [{ reps: 5, weight: 100 }],
            },
          ],
          set_removals: [REMOVAL],
        })
      )
    ).toEqual({
      add_exercise: 0,
      add_sets: 1,
      remove_exercise: 2,
      remove_sets: 1,
      replace_exercise: 0,
    });
  });
});
