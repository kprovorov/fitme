import type { WorkoutSession, WorkoutSessionExerciseSet } from "./models";

type TrackableSet = Pick<WorkoutSessionExerciseSet, "reps_completed">;

interface TrackableExercise {
  sets: TrackableSet[];
}

/** The subset of a workout session that decides whether it is fully tracked. */
export interface TrackableWorkoutSession {
  exercises: TrackableExercise[];
  // The column is nullable in the database: an active session has no finish time yet.
  finished_at: WorkoutSession["finished_at"] | null | undefined;
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
