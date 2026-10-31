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

/** A two-decimal kg/lb round trip can move a stored weight by 0.01. */
export const RECORD_WEIGHT_TOLERANCE = 0.011;

/** Bodyweight stays distinct from every positive load. */
const sameWeight = (a: number, b: number) =>
  (a === 0) === (b === 0) && Math.abs(a - b) < RECORD_WEIGHT_TOLERANCE;

/** Whether `a` beats `b`, allowing for conversion rounding. */
const beats = (a: RecordResult, b: RecordResult) =>
  sameWeight(a.weight, b.weight) ? a.reps > b.reps : a.weight > b.weight;

/**
 * The best usable result among `sets`: the highest weight, with the most
 * reps done at it. A set counts only with positive reps and a weight (zero
 * included); `null` when none does.
 */
export const recordResult = (
  sets: readonly RecordSet[]
): RecordResult | null => {
  const usable = sets.flatMap(
    ({ reps_completed: reps, weight_completed: weight }) =>
      reps !== null && reps > 0 && weight !== null ? [{ reps, weight }] : []
  );
  const highestWeight = usable.reduce(
    (highest, result) => Math.max(highest, result.weight),
    0
  );
  let best: RecordResult | null = null;
  for (const result of usable) {
    if (
      sameWeight(result.weight, highestWeight) &&
      (best === null ||
        result.reps > best.reps ||
        (result.reps === best.reps && result.weight > best.weight))
    ) {
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
  if (earlier === null) {
    return null;
  }
  const best = recordResult(
    sets.filter(
      ({ reps_completed: reps, weight_completed: weight }) =>
        reps !== null &&
        reps > 0 &&
        weight !== null &&
        beats({ reps, weight }, earlier)
    )
  );
  if (best === null) {
    return null;
  }
  return {
    ...best,
    kind: sameWeight(best.weight, earlier.weight) ? "reps" : "weight",
  };
};
