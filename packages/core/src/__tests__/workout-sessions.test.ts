import { describe, expect, it } from "vitest";
import {
  isWorkoutFullyTracked,
  type TrackableWorkoutSession,
} from "../workout-sessions";

const session = (
  exercises: Array<Array<number | null>>,
  finished_at: string | null = null
): TrackableWorkoutSession => ({
  exercises: exercises.map((reps) => ({
    sets: reps.map((reps_completed) => ({ reps_completed })),
  })),
  finished_at,
});

describe("isWorkoutFullyTracked", () => {
  it("returns true when every set of every exercise has reps", () => {
    expect(isWorkoutFullyTracked(session([[10, 8], [12]]))).toBe(true);
  });

  it("returns false when the session has no exercises", () => {
    expect(isWorkoutFullyTracked(session([]))).toBe(false);
  });

  it("returns false when an exercise has no sets", () => {
    expect(isWorkoutFullyTracked(session([[10], []]))).toBe(false);
  });

  it("returns false when any set has null reps", () => {
    expect(isWorkoutFullyTracked(session([[10, null], [12]]))).toBe(false);
  });

  it("treats zero reps as tracked", () => {
    expect(isWorkoutFullyTracked(session([[0], [0, 5]]))).toBe(true);
  });

  it("is independent of exercise and set order", () => {
    // Later sets tracked before earlier ones still leave the session incomplete.
    expect(isWorkoutFullyTracked(session([[null, 8], [12]]))).toBe(false);
    expect(isWorkoutFullyTracked(session([[12], [8, null]]))).toBe(false);
    expect(isWorkoutFullyTracked(session([[12], [8, 10]]))).toBe(true);
  });

  it("returns false for a finished session", () => {
    expect(
      isWorkoutFullyTracked(session([[10], [12]], "2026-10-08T08:00:00Z"))
    ).toBe(false);
  });

  it("treats an undefined finish time as active", () => {
    expect(
      isWorkoutFullyTracked({
        exercises: [{ sets: [{ reps_completed: 1 }] }],
        finished_at: undefined,
      })
    ).toBe(true);
  });
});
