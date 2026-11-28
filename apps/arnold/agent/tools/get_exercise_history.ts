import { recordResult } from "@fitme/core/personal-records";
import { asUser } from "@fitme/db";
import { getExerciseHistory } from "@fitme/services/exercises";
import { lockProfileUnits } from "@fitme/services/profile";
import { defineTool } from "eve/tools";
import { z } from "zod";

import { appLanguage } from "../lib/client-context";
import { exerciseSlugSchema, nameFromSlug } from "../lib/exercises";
import { getLibrary } from "../lib/library";
import { requireConversationOwner } from "../lib/owner";

/** How many entries the best result is worked out over, newest first. */
export const BEST_RESULT_ENTRIES = 500;

const DEFAULT_ENTRIES = 5;
const MAX_ENTRIES = 10;

/** The Exercise's name in the App language, or one made from its slug. */
const exerciseName = async (
  slug: string,
  language: ReturnType<typeof appLanguage>
): Promise<string> => {
  const answer = await getLibrary().get();

  if (answer.status === "unavailable") {
    return nameFromSlug(slug);
  }

  const [exercise] = answer.library.lookup([slug], { language }).data;

  return exercise?.name ?? nameFromSlug(slug);
};

export default defineTool({
  description:
    "Get the user's history of one exercise: their most recent workout sessions with it, newest first, each with its date and logged sets (weights in weight_unit, null for a bodyweight set), the total number of sessions with it, and best_result, their best result so far by the personal record rule (the highest weight, with the most reps at it; null before any finished session). An empty entries list means they haven't logged it yet.",
  async execute({ exercise_slug, limit }, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);

    const { page, units } = await asUser(userId, async (tx) => {
      // Locked first, so a measurement system switch can't commit between
      // reading the unit and reading the weights.
      const profileUnits = await lockProfileUnits(tx, userId);

      return {
        page: await getExerciseHistory(tx, userId, {
          exerciseSlug: exercise_slug,
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
      exercise_slug,
      name: await exerciseName(exercise_slug, appLanguage(ctx.messages)),
      total: page.total,
      weight_unit: units?.weight ?? "kg",
    };
  },
  inputSchema: z.object({
    exercise_slug: exerciseSlugSchema.describe(
      "The exercise's exercise_slug, as search_exercises, the plan or the workout history returns it"
    ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_ENTRIES)
      .default(DEFAULT_ENTRIES)
      .describe(
        `Number of recent sessions to show (default ${DEFAULT_ENTRIES}, max ${MAX_ENTRIES})`
      ),
  }),
});
