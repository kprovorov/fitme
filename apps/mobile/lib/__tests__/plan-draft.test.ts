/**
 * The Plan editor's draft: what it loads from a Plan, what the whole-Plan
 * save sends back, when Save is allowed and when leaving asks first. Pure,
 * so it runs without a screen.
 */
import {
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_WORKOUT_DURATION_MINUTES,
  MIN_FREQUENCY,
} from "@fitme/core";
import { describe, expect, it } from "@jest/globals";

import type { FullPlan } from "~/hooks/queries/plans";
import {
  isSavablePlanDraft,
  moveDraftWorkout,
  planDraftChanged,
  planDraftFrom,
  removeDraftWorkout,
  savePlanBody,
} from "~/lib/plan-draft";

const plan = (overrides: Partial<FullPlan> = {}): FullPlan =>
  ({
    created_at: "2026-10-01T09:00:00.000Z",
    description: "Three full-body days",
    experience_level: "intermediate",
    frequency: 3,
    goal: "strength-performance",
    id: "plan-1",
    is_active: true,
    name: "Full body",
    note: "Keep the bar close",
    place: "gym",
    updated_at: "2026-10-01T09:00:00.000Z",
    weight_unit: "kg",
    workout_duration: 60,
    workouts: [
      {
        cover: "cover-1",
        description: "Legs and pulls",
        exercises: [
          {
            exercise_slug: "barbell-back-squat",
            id: "we-1",
            order: 1,
            sets: [
              {
                id: "set-1",
                order: 1,
                reps_recommended: 8,
                rest_recommended: 120,
                weight_recommended: 80.5,
              },
            ],
          },
        ],
        id: "workout-1",
        name: "Day A",
        order: 1,
      },
      {
        cover: null,
        description: "",
        exercises: [
          {
            exercise_slug: "bench-press",
            id: "we-2",
            order: 1,
            sets: [
              {
                id: "set-2",
                order: 1,
                reps_recommended: 10,
                rest_recommended: 90,
                weight_recommended: 0,
              },
            ],
          },
        ],
        id: "workout-2",
        name: "Day B",
        order: 2,
      },
    ],
    ...overrides,
  }) as FullPlan;

describe("planDraftFrom", () => {
  it("loads the Plan's details, its note and its Workouts in rotation order", () => {
    const draft = planDraftFrom(plan());
    expect(draft).toEqual({
      description: "Three full-body days",
      experienceLevel: "intermediate",
      frequency: 3,
      goal: "strength-performance",
      name: "Full body",
      note: "Keep the bar close",
      place: "gym",
      // Held with the weights it describes, so the set rows never label a
      // kg target `lbs` after a switch made elsewhere.
      weightUnit: "kg",
      workoutDuration: 60,
      workouts: [
        expect.objectContaining({ id: "workout-1", name: "Day A" }),
        expect.objectContaining({ id: "workout-2", name: "Day B" }),
      ],
    });
  });

  it("reads a Plan with no name, description or details as empty and unset", () => {
    const draft = planDraftFrom(
      plan({
        description: null,
        experience_level: null,
        goal: null,
        name: null,
        note: null,
        place: null,
        workout_duration: null,
      })
    );

    expect(draft.name).toBe("");
    expect(draft.description).toBe("");
    expect(draft.note).toBeNull();
    expect(draft.goal).toBeNull();
    expect(draft.place).toBeNull();
    expect(draft.experienceLevel).toBeNull();
    expect(draft.workoutDuration).toBeNull();
  });
});

describe("savePlanBody", () => {
  it("sends every id it loaded, and no field the write doesn't take", () => {
    const draft = planDraftFrom(plan());

    if (!isSavablePlanDraft(draft)) {
      throw new Error("the loaded Plan should be savable");
    }

    expect(savePlanBody(draft)).toEqual({
      description: "Three full-body days",
      experience_level: "intermediate",
      frequency: 3,
      goal: "strength-performance",
      name: "Full body",
      note: "Keep the bar close",
      place: "gym",
      workout_duration: 60,
      workouts: [
        {
          description: "Legs and pulls",
          exercises: [
            {
              exercise_slug: "barbell-back-squat",
              id: "we-1",
              sets: [
                {
                  id: "set-1",
                  reps_recommended: 8,
                  rest_recommended: 120,
                  weight_recommended: 80.5,
                },
              ],
            },
          ],
          id: "workout-1",
          name: "Day A",
        },
        {
          exercises: [
            {
              exercise_slug: "bench-press",
              id: "we-2",
              sets: [
                {
                  id: "set-2",
                  reps_recommended: 10,
                  rest_recommended: 90,
                  weight_recommended: 0,
                },
              ],
            },
          ],
          id: "workout-2",
          name: "Day B",
        },
      ],
    });
  });

  it("trims the name and leaves out a description it has none of", () => {
    const draft = {
      ...planDraftFrom(plan()),
      description: "   ",
      name: "  Push pull  ",
    };

    if (!isSavablePlanDraft(draft)) {
      throw new Error("the draft should be savable");
    }

    const body = savePlanBody(draft);
    expect(body.name).toBe("Push pull");
    expect("description" in body).toBe(false);
  });
});

describe("isSavablePlanDraft", () => {
  const draft = () => planDraftFrom(plan());

  it("allows the Plan as it was loaded", () => {
    expect(isSavablePlanDraft(draft())).toBe(true);
  });

  it("refuses a name that is empty or only spaces", () => {
    expect(isSavablePlanDraft({ ...draft(), name: "" })).toBe(false);
    expect(isSavablePlanDraft({ ...draft(), name: "  " })).toBe(false);
  });

  it("refuses a name past its length", () => {
    expect(
      isSavablePlanDraft({
        ...draft(),
        name: "a".repeat(MAX_PLAN_NAME_LENGTH + 1),
      })
    ).toBe(false);
  });

  it("refuses a frequency outside its bounds, or none", () => {
    expect(
      isSavablePlanDraft({ ...draft(), frequency: MIN_FREQUENCY - 1 })
    ).toBe(false);
    expect(
      isSavablePlanDraft({ ...draft(), frequency: MAX_FREQUENCY + 1 })
    ).toBe(false);
    expect(isSavablePlanDraft({ ...draft(), frequency: 2.5 })).toBe(false);
    expect(isSavablePlanDraft({ ...draft(), frequency: null })).toBe(false);
  });

  it("refuses a Workout duration outside its bounds", () => {
    expect(isSavablePlanDraft({ ...draft(), workoutDuration: 0 })).toBe(false);
    expect(
      isSavablePlanDraft({
        ...draft(),
        workoutDuration: MAX_WORKOUT_DURATION_MINUTES + 1,
      })
    ).toBe(false);
  });

  it("refuses a Plan with no Workout left", () => {
    expect(isSavablePlanDraft({ ...draft(), workouts: [] })).toBe(false);
  });

  it("refuses a Workout with no Exercise", () => {
    const [first, second] = draft().workouts;
    expect(
      isSavablePlanDraft({
        ...draft(),
        workouts: [{ ...first, exercises: [] }, second],
      })
    ).toBe(false);
  });

  it("refuses a detail the Plan hasn't got, since the save can't clear one yet", () => {
    expect(isSavablePlanDraft({ ...draft(), goal: null })).toBe(false);
    expect(isSavablePlanDraft({ ...draft(), place: null })).toBe(false);
    expect(isSavablePlanDraft({ ...draft(), experienceLevel: null })).toBe(
      false
    );
    expect(isSavablePlanDraft({ ...draft(), workoutDuration: null })).toBe(
      false
    );
  });
});

describe("the Workout rows", () => {
  it("moves a Workout up and down, and leaves the ends alone", () => {
    const loaded = planDraftFrom(plan());
    expect(moveDraftWorkout(loaded, 1, -1).workouts.map((w) => w.id)).toEqual([
      "workout-2",
      "workout-1",
    ]);
    expect(moveDraftWorkout(loaded, 0, -1).workouts.map((w) => w.id)).toEqual([
      "workout-1",
      "workout-2",
    ]);
    expect(moveDraftWorkout(loaded, 1, 1).workouts.map((w) => w.id)).toEqual([
      "workout-1",
      "workout-2",
    ]);
  });

  it("removes a Workout", () => {
    const loaded = planDraftFrom(plan());
    expect(removeDraftWorkout(loaded, 0).workouts.map((w) => w.id)).toEqual([
      "workout-2",
    ]);
  });
});

describe("planDraftChanged", () => {
  it("is false for the draft as it was loaded, whatever was read", () => {
    const loaded = planDraftFrom(plan());
    expect(planDraftChanged(loaded, planDraftFrom(plan()))).toBe(false);
  });

  it("is true once a detail, the name or the Workouts changed", () => {
    const loaded = planDraftFrom(plan());
    expect(planDraftChanged(loaded, { ...loaded, name: "Push pull" })).toBe(
      true
    );
    expect(planDraftChanged(loaded, { ...loaded, frequency: 4 })).toBe(true);
    expect(planDraftChanged(loaded, { ...loaded, goal: "fat-loss" })).toBe(
      true
    );
    expect(planDraftChanged(loaded, removeDraftWorkout(loaded, 0))).toBe(true);
    expect(planDraftChanged(loaded, moveDraftWorkout(loaded, 1, -1))).toBe(
      true
    );
  });
});
