import {
  getWeightLabel,
  type MeasurementSystem,
  type PlanChange,
  type PlanChangeExercise,
  type PlanChangeKind,
  type PlanChangeSet,
  type PlanChanges,
} from "@fitme/core";

export interface PlanChangeLine {
  /** The line spelled out for VoiceOver, without `×` and `·`. */
  accessibilityLabel: string;
  text: string;
}

const SPOKEN_WEIGHT_UNIT: Record<MeasurementSystem, string> = {
  metric: "kilograms",
  uk: "pounds",
  us: "pounds",
};

const setsText = (sets: PlanChangeSet[], unit: string) =>
  `${sets.map(({ reps, weight }) => `${reps}×${weight}`).join(", ")} ${unit}`;

const spokenSets = (sets: PlanChangeSet[], unit: string) =>
  sets
    .map(
      ({ reps, weight }) =>
        `${reps} ${reps === 1 ? "rep" : "reps"} at ${weight} ${unit}`
    )
    .join(", ");

/**
 * The sheet's line for one change, weights in the User's unit:
 * "Replace Bench Press with Dumbbell Press · 8×30, 6×30 kg", "Add Cable Fly ·
 * 12×15 kg", "Remove Dips", "Add 1 set to Squat · 5×100 kg".
 */
export function formatPlanChange(
  change: PlanChange,
  measurementSystem: MeasurementSystem,
  /** How to name an Exercise; the RPC's (legacy) name by default. */
  nameOf: (exercise: PlanChangeExercise) => string = ({ name }) => name
): PlanChangeLine {
  const unit = getWeightLabel(measurementSystem) ?? "kg";
  const exercise = nameOf(change.exercise);
  let title: string;
  switch (change.kind) {
    case "replace_exercise":
      title = `Replace ${nameOf(change.replaced_exercise)} with ${exercise}`;
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
    accessibilityLabel: `${title}: ${spokenSets(change.sets, SPOKEN_WEIGHT_UNIT[measurementSystem])}`,
    text: `${title} · ${setsText(change.sets, unit)}`,
  };
}

/** Every Exercise slug the changes name, for resolving them. */
export const planChangeSlugs = (changes: PlanChange[]): string[] =>
  changes.flatMap((change) =>
    change.kind === "replace_exercise"
      ? [change.exercise.slug, change.replaced_exercise.slug]
      : [change.exercise.slug]
  );

/** How many changes of each kind, for analytics. */
export function countPlanChanges(
  changes: PlanChange[]
): Record<PlanChangeKind, number> {
  const counts: Record<PlanChangeKind, number> = {
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
  { plan, workout }: PlanChanges
) => ({
  plan_id: plan?.id,
  workout_id: workout?.id,
  workout_session_id: sessionId,
});
