/**
 * Personal records (ADR 0015): a logged set beating the User's results for
 * the same Exercise in earlier finished Workout Sessions. Weights are all in
 * one unit, the User's.
 */

/** A logged set, as a Workout Session stores it. */
export interface RecordSet {
  reps_completed: number | null;
  /** `0` is an explicit bodyweight set; `null` was never weighed. */
  weight_completed: number | null;
}

/** A result: a weight and the reps done at it. */
export interface RecordResult {
  reps: number;
  weight: number;
}

/** How a record beat the earlier ones: a higher weight, or more reps at it. */
export type PersonalRecordKind = "reps" | "weight";

export interface PersonalRecord extends RecordResult {
  kind: PersonalRecordKind;
}

/** Whether `a` beats `b`: a higher weight, or more reps at the same weight. */
const beats = (a: RecordResult, b: RecordResult) =>
  a.weight > b.weight || (a.weight === b.weight && a.reps > b.reps);

/**
 * The best usable result among `sets`: the highest weight, with the most
 * reps done at it. A set counts only with positive reps and a weight (zero
 * included); `null` when none does.
 */
export const recordResult = (
  sets: readonly RecordSet[]
): RecordResult | null => {
  let best: RecordResult | null = null;
  for (const { reps_completed: reps, weight_completed: weight } of sets) {
    if (reps === null || reps <= 0 || weight === null) {
      continue;
    }
    const result = { reps, weight };
    if (best === null || beats(result, best)) {
      best = result;
    }
  }
  return best;
};

/**
 * The Personal record a Workout Session's sets of one Exercise earn against
 * `earlier`, the best result (`recordResult`) of that Exercise in the User's
 * earlier finished Workout Sessions, or `null` for none. Without an earlier
 * result the session sets the baseline and earns nothing; a tie earns
 * nothing; fewer reps at a higher weight is a weight record; more reps at a
 * lower weight (bodyweight under a weighted record included) never is one.
 */
export const personalRecordFor = (
  earlier: RecordResult | null,
  sets: readonly RecordSet[]
): PersonalRecord | null => {
  const best = recordResult(sets);
  if (earlier === null || best === null || !beats(best, earlier)) {
    return null;
  }
  return {
    ...best,
    kind: best.weight > earlier.weight ? "weight" : "reps",
  };
};
