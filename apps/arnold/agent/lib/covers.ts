import { pickCovers } from "@fitme/core/covers";
import type { LegacyMuscleGroup } from "@fitme/core/models";

import { libraryUnavailable } from "./exercises";
import { getLibrary } from "./library";
import { getLibraryIndex } from "./library-index";

/** A new Workout, as far as its Cover goes: its Exercises by slug, in order. */
export interface WorkoutToCover {
  exercises: readonly { exercise_slug: string }[];
}

/** Picks the Covers of `workouts`, counting `usedCoverIds` as used. */
export type CoverPicker = (
  workouts: readonly WorkoutToCover[],
  usedCoverIds: readonly string[]
) => (string | null)[];

/**
 * Loads what picking Covers needs (the new Library and the Library index's
 * Covers) and answers a picker that works in memory, so a save can pick its
 * new Workouts' Covers inside its own transaction, once it has read the
 * Covers its kept Workouts hold (`savePlan`'s `coverNewWorkouts`). When the
 * new Library or the index can't load (each reports why), it answers an
 * `{ error }` asking to retry.
 */
export const loadCoverPicker = async ({
  random,
}: { random?: () => number } = {}): Promise<
  { pick: CoverPicker } | { error: string }
> => {
  const answer = await getLibrary().get();

  if (answer.status === "unavailable") {
    return libraryUnavailable("nothing was saved");
  }

  // No slug to look up: the index answers its Covers alone.
  const found = await getLibraryIndex().lookup([]);

  if (found.status === "unavailable") {
    return libraryUnavailable("nothing was saved");
  }

  const { library } = answer;

  const covers = found.covers.map((cover) => ({
    id: cover.id,
    // SAFETY: pickCovers only compares groups for equality, so a new Library group the legacy list lacks simply matches no Cover.
    muscleGroups: cover.muscle_groups as LegacyMuscleGroup[],
  }));

  return {
    pick: (workouts, usedCoverIds) => {
      if (workouts.length === 0) {
        return [];
      }

      const { known } = library.checkSlugs([
        ...new Set(
          workouts.flatMap((workout) =>
            workout.exercises.map((exercise) => exercise.exercise_slug)
          )
        ),
      ]);

      // Keyed by the slug as sent, which is what each Workout carries.
      const muscleGroups = new Map(
        known.map((exercise) => [
          exercise.requested_slug,
          // SAFETY: as above, pickCovers only compares the groups for equality.
          exercise.muscle_groups as readonly LegacyMuscleGroup[],
        ])
      );

      return pickCovers({
        covers,
        random,
        usedCoverIds,
        workouts: workouts.map((workout) => ({
          exercises: workout.exercises.map((exercise) => ({
            muscleGroups: muscleGroups.get(exercise.exercise_slug) ?? [],
          })),
        })),
      });
    },
  };
};

/**
 * Picks a Cover for each of `workouts`, the new Workouts of a Plan write
 * (ADR 0014), in order, as the Public API and MCP pick them: the shared
 * picker over the Library index's Covers and the primary muscle groups the
 * new Library has for each Exercise, distinct within the Plan while there are
 * enough. `usedCoverIds` are the Covers the Plan's kept Workouts hold, counted
 * as used. `pickCovers` matches by muscle group id, so the groups both lists
 * share match and the rest fall back to any Cover; a slug the Library doesn't
 * know adds no group. An index without Covers answers `null` for each.
 *
 * Call it before any write, with the slugs already checked
 * (`checkExerciseSlugs`): its error says nothing was saved. When
 * the new Library or the index can't load (each reports why), it answers an
 * `{ error }` asking to retry, so no Workout is ever saved without its Cover
 * being tried.
 */
export const pickWorkoutCovers = async ({
  random,
  usedCoverIds = [],
  workouts,
}: {
  random?: () => number;
  usedCoverIds?: readonly string[];
  workouts: readonly WorkoutToCover[];
}): Promise<{ covers: (string | null)[] } | { error: string }> => {
  if (workouts.length === 0) {
    return { covers: [] };
  }

  const picker = await loadCoverPicker({ random });

  return "error" in picker
    ? picker
    : { covers: picker.pick(workouts, usedCoverIds) };
};
