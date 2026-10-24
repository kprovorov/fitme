/**
 * What `workout_session_plan_changes` answers: the structural changes a
 * finished Workout Session made to its Workout, which the app offers to save
 * to the Plan (the "Update your plan?" sheet).
 */

interface NamedRef {
  id: string;
  name: string;
}

/**
 * An Exercise of a change: its Exercise slug, and a name the RPC makes from
 * the slug (`barbell-back-squat` → `Barbell back squat`).
 */
interface ExerciseRef {
  name: string;
  slug: string;
}

/** A set the Plan gets, its targets taken from what the User logged. */
export interface PlanChangeSet {
  reps: number;
  weight: number;
}

export type PlanChange =
  | {
      exercise: ExerciseRef;
      kind: "replace_exercise";
      replaced_exercise: ExerciseRef;
      sets: PlanChangeSet[];
    }
  | { exercise: ExerciseRef; kind: "add_exercise"; sets: PlanChangeSet[] }
  | { exercise: ExerciseRef; kind: "remove_exercise" }
  | { exercise: ExerciseRef; kind: "add_sets"; sets: PlanChangeSet[] };

export type PlanChangeKind = PlanChange["kind"];

/**
 * The RPC's answer, in both modes: the Plan and Workout a finished Workout
 * Session would update (null when they're gone), and the structural changes,
 * in Workout order.
 */
export interface PlanChanges {
  changes: PlanChange[];
  plan: NamedRef | null;
  workout: NamedRef | null;
}
