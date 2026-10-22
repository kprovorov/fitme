import { asUser } from "@fitme/db";
import { legacyExerciseIdsBySlug } from "@fitme/services/exercises";

/**
 * The legacy `exercises` table uuid of each slug, read as `userId`. Only for
 * `display_workout_plan`: the plan card in installed v2.0.0 apps reads
 * `exercise_id` and sends it to `create_plan`. Delete it, and the field, with
 * the table at the contract step.
 */
export const legacyExerciseIds = (
  userId: string,
  slugs: readonly string[]
): Promise<Map<string, string>> =>
  asUser(userId, (tx) => legacyExerciseIdsBySlug(tx, slugs));
