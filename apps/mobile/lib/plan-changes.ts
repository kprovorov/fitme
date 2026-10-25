import type { components } from "~/lib/api/schema";

/**
 * The Public API's Plan Update (`GET /v1/workout-sessions/{id}/plan-update`):
 * the Plan and Workout a finished Workout Session would update (null when
 * they're gone), its changes in Workout order, Exercises as slugs, and the
 * unit of their weights.
 */
export type PlanUpdate = components["schemas"]["PlanUpdate"];
export type PlanUpdateChange = components["schemas"]["PlanUpdateChange"];
export type PlanUpdateChangeKind = PlanUpdateChange["kind"];
type PlanUpdateSet = components["schemas"]["PlanUpdateSet"];
type WeightUnit = PlanUpdate["weight_unit"];

export interface PlanChangeLine {
  /** The line spelled out for VoiceOver, without `×` and `·`. */
  accessibilityLabel: string;
  text: string;
}

const SPOKEN_WEIGHT_UNIT: Record<WeightUnit, string> = {
  kg: "kilograms",
  lbs: "pounds",
};

const setsText = (sets: PlanUpdateSet[], unit: string) =>
  `${sets.map(({ reps, weight }) => `${reps}×${weight}`).join(", ")} ${unit}`;

const spokenSets = (sets: PlanUpdateSet[], unit: string) =>
  sets
    .map(
      ({ reps, weight }) =>
        `${reps} ${reps === 1 ? "rep" : "reps"} at ${weight} ${unit}`
    )
    .join(", ");

/** Every Exercise slug the changes name, for the Exercise Library. */
export const planUpdateSlugs = (changes: PlanUpdateChange[]): string[] =>
  changes.flatMap((change) =>
    change.kind === "replace_exercise"
      ? [change.replaced_exercise_slug, change.exercise_slug]
      : [change.exercise_slug]
  );

/**
 * The sheet's line for one change, weights in `weightUnit` and each Exercise
 * by `nameOf` its slug: "Replace Bench Press with Dumbbell Press · 8×30, 6×30
 * kg", "Add Cable Fly · 12×15 kg", "Remove Dips", "Add 1 set to Squat · 5×100
 * kg".
 */
export function formatPlanChange(
  change: PlanUpdateChange,
  weightUnit: WeightUnit,
  nameOf: (slug: string) => string
): PlanChangeLine {
  const exercise = nameOf(change.exercise_slug);
  let title: string;
  switch (change.kind) {
    case "replace_exercise":
      title = `Replace ${nameOf(change.replaced_exercise_slug)} with ${exercise}`;
      break;
    case "add_exercise":
      title = `Add ${exercise}`;
      break;
    case "remove_exercise":
      return {
        accessibilityLabel: `Remove ${exercise}`,
        text: `Remove ${exercise}`,
      };
    case "add_sets": {
      const count = change.sets.length;
      title = `Add ${count} ${count === 1 ? "set" : "sets"} to ${exercise}`;
      break;
    }
    default: {
      const unknown: never = change;
      throw new Error(`Unknown plan change ${JSON.stringify(unknown)}`);
    }
  }
  return {
    accessibilityLabel: `${title}: ${spokenSets(change.sets, SPOKEN_WEIGHT_UNIT[weightUnit])}`,
    text: `${title} · ${setsText(change.sets, weightUnit)}`,
  };
}

/** How many changes of each kind, for analytics. */
export function countPlanChanges(
  changes: PlanUpdateChange[]
): Record<PlanUpdateChangeKind, number> {
  const counts: Record<PlanUpdateChangeKind, number> = {
    add_exercise: 0,
    add_sets: 0,
    remove_exercise: 0,
    replace_exercise: 0,
  };
  for (const change of changes) {
    counts[change.kind] += 1;
  }
  return counts;
}

/** What every Plan Update analytics event says about the question. */
export const planUpdateProperties = (
  sessionId: string,
  { plan, workout }: PlanUpdate
) => ({
  plan_id: plan?.id,
  workout_id: workout?.id,
  workout_session_id: sessionId,
});
