import { getWeightLabel, type MeasurementSystem } from "@fitme/core";

interface NamedRef {
  id: string;
  name: string;
}

/** A set the Plan gets, its targets taken from what the User logged. */
export interface PlanChangeSet {
  reps: number;
  weight: number;
}

export type PlanChange =
  | {
      exercise: NamedRef;
      kind: "replace_exercise";
      replaced_exercise: NamedRef;
      sets: PlanChangeSet[];
    }
  | { exercise: NamedRef; kind: "add_exercise"; sets: PlanChangeSet[] }
  | { exercise: NamedRef; kind: "remove_exercise" }
  | { exercise: NamedRef; kind: "add_sets"; sets: PlanChangeSet[] };

export type PlanChangeKind = PlanChange["kind"];

/**
 * What `workout_session_plan_changes` answers, in both modes: the Plan and
 * Workout a finished Workout Session would update (null when they're gone),
 * and the structural changes, in Workout order.
 */
export interface PlanChanges {
  changes: PlanChange[];
  plan: NamedRef | null;
  workout: NamedRef | null;
}

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
  measurementSystem: MeasurementSystem
): PlanChangeLine {
  const unit = getWeightLabel(measurementSystem) ?? "kg";
  const exercise = change.exercise.name;
  let title: string;
  switch (change.kind) {
    case "replace_exercise":
      title = `Replace ${change.replaced_exercise.name} with ${exercise}`;
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
