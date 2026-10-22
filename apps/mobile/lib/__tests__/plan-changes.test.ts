import type { PlanChange } from "@fitme/core";
import { describe, expect, it } from "@jest/globals";
import { countPlanChanges, formatPlanChange } from "../plan-changes";

const bench = { id: "e-1", name: "Bench Press" };
const press = { id: "e-2", name: "Dumbbell Press" };
const squat = { id: "e-3", name: "Squat" };

describe("formatPlanChange", () => {
  it("lists a replacement's sets in kilograms for metric", () => {
    expect(
      formatPlanChange(
        {
          exercise: press,
          kind: "replace_exercise",
          replaced_exercise: bench,
          sets: [
            { reps: 8, weight: 30 },
            { reps: 6, weight: 32.5 },
          ],
        },
        "metric"
      )
    ).toEqual({
      accessibilityLabel:
        "Replace Bench Press with Dumbbell Press: 8 reps at 30 kilograms, 6 reps at 32.5 kilograms",
      text: "Replace Bench Press with Dumbbell Press · 8×30, 6×32.5 kg",
    });
  });

  it("says pounds for US and UK Users", () => {
    const change: PlanChange = {
      exercise: squat,
      kind: "add_exercise",
      sets: [{ reps: 1, weight: 225 }],
    };
    for (const system of ["us", "uk"] as const) {
      expect(formatPlanChange(change, system)).toEqual({
        accessibilityLabel: "Add Squat: 1 rep at 225 pounds",
        text: "Add Squat · 1×225 lbs",
      });
    }
  });

  it("counts added sets, singular and plural", () => {
    const addSets = (count: number): PlanChange => ({
      exercise: squat,
      kind: "add_sets",
      sets: Array.from({ length: count }, () => ({ reps: 5, weight: 100 })),
    });
    expect(formatPlanChange(addSets(1), "metric").text).toBe(
      "Add 1 set to Squat · 5×100 kg"
    );
    expect(formatPlanChange(addSets(2), "metric").text).toBe(
      "Add 2 sets to Squat · 5×100, 5×100 kg"
    );
  });

  it("names only the Exercise for a removal", () => {
    expect(
      formatPlanChange({ exercise: bench, kind: "remove_exercise" }, "us")
    ).toEqual({
      accessibilityLabel: "Remove Bench Press",
      text: "Remove Bench Press",
    });
  });

  it("shows a bodyweight set's weight as 0", () => {
    expect(
      formatPlanChange(
        {
          exercise: squat,
          kind: "add_exercise",
          sets: [{ reps: 12, weight: 0 }],
        },
        "metric"
      ).text
    ).toBe("Add Squat · 12×0 kg");
  });
});

describe("countPlanChanges", () => {
  it("counts each kind, zero included", () => {
    expect(
      countPlanChanges([
        { exercise: bench, kind: "remove_exercise" },
        { exercise: squat, kind: "remove_exercise" },
        { exercise: squat, kind: "add_sets", sets: [{ reps: 5, weight: 100 }] },
      ])
    ).toEqual({
      add_exercise: 0,
      add_sets: 1,
      remove_exercise: 2,
      replace_exercise: 0,
    });
  });
});
