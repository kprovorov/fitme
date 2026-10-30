import type { MuscleGroup } from "./models";

/** A Library Cover the picker can choose. */
export interface CoverOption {
  id: string;
  muscleGroups: readonly MuscleGroup[];
}

/** A Workout to cover: its Exercises' muscle groups, in Exercise order. */
export interface CoverWorkout {
  exercises: ReadonlyArray<{ muscleGroups: readonly MuscleGroup[] }>;
}

export interface PickCoversInput {
  covers: readonly CoverOption[];
  /** A number in [0, 1), like `Math.random` (the default). */
  random?: () => number;
  /** Cover ids the Plan's other Workouts already use, repeats counted. */
  usedCoverIds?: readonly string[];
  workouts: readonly CoverWorkout[];
}

/**
 * The Workout's muscle groups, most-trained first: each counts once per
 * Exercise training it, and a tie goes to the group met first.
 */
const rankMuscleGroups = (workout: CoverWorkout): MuscleGroup[] => {
  const counts = new Map<MuscleGroup, number>();
  for (const exercise of workout.exercises) {
    for (const group of new Set(exercise.muscleGroups)) {
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
  }
  // Map keeps insertion order and the sort is stable, so ties stay first-met.
  return [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([group]) => group);
};

/** `items` must not be empty; a `random` outside [0, 1) is clamped into it. */
const pickAtRandom = <T>(items: readonly T[], random: () => number): T => {
  const index = Math.floor(random() * items.length);
  const inRange = Number.isNaN(index)
    ? 0
    : Math.min(Math.max(index, 0), items.length - 1);
  return items[inRange] as T;
};

/**
 * Picks a Cover for each Workout of a Plan (ADR 0014), in order: one Cover id
 * per Workout, or `null` for each when the Library has no Covers.
 *
 * Only the Covers the Plan uses least (counting `usedCoverIds` and the picks
 * made so far in this call) are candidates, so the Workouts stay on different
 * Covers while there are enough, and reuse the least-used ones after that.
 * Among those it takes the Covers tagged with the Workout's most-trained
 * muscle group, then the next group, then any, and picks one at random.
 */
export function pickCovers({
  covers,
  random = Math.random,
  usedCoverIds = [],
  workouts,
}: PickCoversInput): Array<string | null> {
  // A repeated id counts once, so it's never likelier to be picked.
  const options = [
    ...new Map(covers.map((option) => [option.id, option])).values(),
  ];
  if (options.length === 0) {
    return workouts.map(() => null);
  }
  const uses = new Map(options.map((option) => [option.id, 0]));
  for (const id of usedCoverIds) {
    const count = uses.get(id);
    if (count !== undefined) {
      uses.set(id, count + 1);
    }
  }
  const usesOf = (option: CoverOption) => uses.get(option.id) ?? 0;

  return workouts.map((workout) => {
    const fewestUses = options.reduce(
      (fewest, option) => Math.min(fewest, usesOf(option)),
      Number.POSITIVE_INFINITY
    );
    const leastUsed = options.filter((option) => usesOf(option) === fewestUses);
    const tiers = [
      ...rankMuscleGroups(workout).map((group) =>
        leastUsed.filter((option) => option.muscleGroups.includes(group))
      ),
      leastUsed,
    ];
    const candidates = tiers.find((tier) => tier.length > 0) ?? leastUsed;
    const picked = pickAtRandom(candidates, random);
    uses.set(picked.id, usesOf(picked) + 1);
    return picked.id;
  });
}
