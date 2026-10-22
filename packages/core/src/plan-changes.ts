/**
 * What `workout_session_plan_changes` answers: the structural changes a
 * finished Workout Session made to its Workout, which the app offers to save
 * to the Plan (the "Update your plan?" sheet).
 */

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
 * The RPC's answer, in both modes: the Plan and Workout a finished Workout
 * Session would update (null when they're gone), and the structural changes,
 * in Workout order.
 */
export interface PlanChanges {
  changes: PlanChange[];
  plan: NamedRef | null;
  workout: NamedRef | null;
}
