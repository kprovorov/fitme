import type { AppLanguage } from "@fitme/core/models";
import { recordResult } from "@fitme/core/personal-records";
import { asUser } from "@fitme/db";
import { getExerciseHistory } from "@fitme/services/exercises";
import { lockProfileUnits } from "@fitme/services/profile";

import { nameFromSlug } from "./exercises";
import { getLibrary } from "./library";

/** How many entries the best result is worked out over, newest first. */
export const BEST_RESULT_ENTRIES = 500;

/** The recent sessions shown when nobody asks for another number. */
export const DEFAULT_HISTORY_ENTRIES = 5;

export const MAX_HISTORY_ENTRIES = 10;

/** The Exercise's name in the App language, or one made from its slug. */
const exerciseName = async (
  slug: string,
  language: AppLanguage
): Promise<string> => {
  const answer = await getLibrary().get();

  if (answer.status === "unavailable") {
    return nameFromSlug(slug);
  }

  const [exercise] = answer.library.lookup([slug], { language }).data;

  return exercise?.name ?? nameFromSlug(slug);
};

/**
 * The User's history of one Exercise as `get_exercise_history` and
 * `show_exercise_history` both answer it, so Arnold's text and the card read
 * the same numbers: the `limit` most recent entries, newest first, the best
 * result over the newest `BEST_RESULT_ENTRIES` finished ones, the total and
 * the weight unit every weight is in (`kg` without a Profile).
 */
export const readExerciseHistory = async (
  userId: string,
  {
    exerciseSlug,
    language,
    limit,
  }: {
    exerciseSlug: string;
    language: AppLanguage;
    limit: number;
  }
) => {
  const { page, units } = await asUser(userId, async (tx) => {
    // Locked first, so a measurement system switch can't commit between
    // reading the unit and reading the weights.
    const profileUnits = await lockProfileUnits(tx, userId);

    return {
      page: await getExerciseHistory(tx, userId, {
        exerciseSlug,
        limit: BEST_RESULT_ENTRIES,
        offset: 0,
      }),
      units: profileUnits,
    };
  });

  const best = recordResult(
    page.entries.flatMap((entry) =>
      entry.finished_at === null ? [] : entry.sets
    )
  );

  return {
    best_result: best,
    entries: page.entries.slice(0, limit).map((entry) => ({
      id: entry.session_exercise_id,
      session: {
        finished_at: entry.finished_at,
        id: entry.session_id,
        started_at: entry.started_at,
      },
      sets: entry.sets.map((set) => ({
        id: set.id,
        note: set.note,
        order: set.order,
        reps_completed: set.reps_completed,
        reps_recommended: set.reps_recommended,
        weight_completed: set.weight_completed,
        weight_recommended: set.weight_recommended,
      })),
    })),
    exercise_slug: exerciseSlug,
    name: await exerciseName(exerciseSlug, language),
    total: page.total,
    weight_unit: units?.weight ?? "kg",
  };
};

export type ExerciseHistoryAnswer = Awaited<
  ReturnType<typeof readExerciseHistory>
>;
