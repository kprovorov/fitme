import type { WorkoutSessionExerciseSet } from "./models";

type TrackableSet = Pick<WorkoutSessionExerciseSet, "reps_completed">;

interface TrackableExercise {
  sets: TrackableSet[];
}

/** The subset of a workout session that decides whether it is fully tracked. */
export interface TrackableWorkoutSession {
  exercises: TrackableExercise[];
  // The column is nullable in the database: an active session has no finish time yet.
  finished_at: string | null | undefined;
}

const isSetTracked = (set: TrackableSet): boolean =>
  set.reps_completed !== null && set.reps_completed !== undefined;

const isExerciseTracked = (exercise: TrackableExercise): boolean =>
  exercise.sets.length > 0 && exercise.sets.every(isSetTracked);

/**
 * Whether every set of an active workout session has been tracked, i.e. the
 * session is ready to be finished. Requires at least one exercise, at least one
 * set per exercise, and `reps_completed` recorded on every set (zero counts as
 * tracked). Finished sessions are never eligible. Exercise and set order is
 * irrelevant.
 */
export function isWorkoutFullyTracked(
  session: TrackableWorkoutSession
): boolean {
  if (session.finished_at) {
    return false;
  }
  return (
    session.exercises.length > 0 && session.exercises.every(isExerciseTracked)
  );
}

/**
 * The exercises with at least one set logged (`reps_completed` recorded; zero
 * counts), in their given order. A finished session's skipped exercises are
 * left out of its summary and history.
 */
export function loggedExercises<T extends TrackableExercise>(
  exercises: T[]
): T[] {
  return exercises.filter((exercise) => exercise.sets.some(isSetTracked));
}

/** How many sets of a session have no `reps_completed` recorded yet. */
export function countUnloggedSets(
  session: Pick<TrackableWorkoutSession, "exercises">
): number {
  return session.exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.filter((set) => !isSetTracked(set)).length,
    0
  );
}

/** How many sets of a session have `reps_completed` recorded. */
export function countLoggedSets(
  session: Pick<TrackableWorkoutSession, "exercises">
): number {
  return session.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter(isSetTracked).length,
    0
  );
}

export type ExerciseProgressState = "done" | "in-progress" | "todo";

export interface ExerciseProgress {
  logged: number;
  state: ExerciseProgressState;
  total: number;
}

/**
 * Where an exercise of a session stands: `done` once it has sets and every
 * one is logged, `in-progress` once some are, `todo` otherwise (an exercise
 * without sets included).
 */
export function exerciseProgress(sets: TrackableSet[]): ExerciseProgress {
  const total = sets.length;
  const logged = sets.filter(isSetTracked).length;
  if (total > 0 && logged === total) {
    return { logged, state: "done", total };
  }
  return { logged, state: logged > 0 ? "in-progress" : "todo", total };
}

type ResultSet = Pick<
  WorkoutSessionExerciseSet,
  "order" | "reps_completed" | "weight_completed"
>;

/**
 * Total weight moved: weight × reps over every logged set, in the unit the
 * weights are stored in. Sets without a weight count as zero.
 */
export function sessionVolume(
  exercises: { sets: Omit<ResultSet, "order">[] }[]
): number {
  const volume = exercises.reduce(
    (total, exercise) =>
      total +
      exercise.sets.reduce(
        (sum, set) =>
          isSetTracked(set)
            ? sum + (set.weight_completed ?? 0) * (set.reps_completed ?? 0)
            : sum,
        0
      ),
    0
  );
  return Math.round(volume * 100) / 100;
}

/** A logged set's result: what was lifted, for how many reps. */
export interface SetResult {
  reps: number;
  weight: number | null;
}

/**
 * The sets of the most recent other session of an exercise, by set order:
 * what to beat in the "previous" column. `history` is newest first (as the
 * exercise history query returns it); the entry with `currentId` (the
 * exercise of the session being logged) is skipped, as are entries with
 * nothing logged.
 */
export function previousSetsByOrder(
  history: Array<{ id: string; sets: ResultSet[] }>,
  currentId: string
): Map<number, SetResult> {
  const previous = history.find(
    (entry) => entry.id !== currentId && entry.sets.some(isSetTracked)
  );
  const byOrder = new Map<number, SetResult>();
  for (const set of previous?.sets ?? []) {
    if (isSetTracked(set)) {
      byOrder.set(set.order, {
        reps: set.reps_completed ?? 0,
        weight: set.weight_completed,
      });
    }
  }
  return byOrder;
}

/**
 * The heaviest logged set (most reps breaks a tie), or `null` when nothing is
 * logged. Sets without a weight only win when no set has one.
 */
export function bestSet(sets: Omit<ResultSet, "order">[]): SetResult | null {
  let best: SetResult | null = null;
  for (const set of sets) {
    if (!isSetTracked(set)) {
      continue;
    }
    const result = {
      reps: set.reps_completed ?? 0,
      weight: set.weight_completed,
    };
    const weight = result.weight ?? 0;
    const bestWeight = best?.weight ?? 0;
    if (
      best === null ||
      weight > bestWeight ||
      (weight === bestWeight && result.reps > best.reps)
    ) {
      best = result;
    }
  }
  return best;
}

/** `17.5 × 12`, or `12 reps` for a set without weight. */
export function formatSetResult({ reps, weight }: SetResult): string {
  return weight ? `${weight} × ${reps}` : `${reps} reps`;
}

/** The recommended reps of some sets as `12` or a range `10–12`, or `null`. */
export function formatRepRange(
  sets: Pick<WorkoutSessionExerciseSet, "reps_recommended">[]
): string | null {
  const reps = sets
    .map((set) => set.reps_recommended)
    .filter((value): value is number => value !== null && value > 0);
  if (reps.length === 0) {
    return null;
  }
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  return min === max ? `${min}` : `${min}–${max}`;
}
