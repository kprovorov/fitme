import { asUser } from "@fitme/db";
import { reportError } from "@fitme/observability/node";
import { legacyExerciseIdsBySlug } from "@fitme/services/exercises";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { checkExerciseSlugs, exerciseSlugSchema } from "../lib/exercises";
import { requireConversationOwner } from "../lib/owner";

const exerciseSchema = z.object({
  exercise_slug: exerciseSlugSchema.describe(
    "The exercise_slug from search_exercises results. Must match one search_exercises returned — do not invent slugs."
  ),
  name: z.string().describe("The display name of the exercise."),
  notes: z.string().optional(),
  reps: z.string(),
  restSeconds: z.number().optional(),
  sets: z.number(),
});

const workoutSchema = z.object({
  dayLabel: z.string(),
  exercises: z.array(exerciseSchema),
  name: z.string(),
});

// The app renders its output as the plan card, so the shape must stay what
// the app expects. Writes nothing: the app creates the Plan from the card.
export default defineTool({
  description:
    "Display a generated workout plan as a structured card in the UI. Call this when the user requests a workout plan to be created or generated.",
  async execute(input, ctx) {
    const userId = requireConversationOwner(ctx.session.auth);
    const slugs = input.workouts.flatMap(({ exercises }) =>
      exercises.map(({ exercise_slug }) => exercise_slug)
    );
    const refused = await checkExerciseSlugs(slugs);
    if (refused) {
      // A tool error, never an `{ error }` result: the app renders every
      // successful result as a plan card (installed builds included)
      throw new Error(refused.error);
    }
    // Until the contract step (then delete this and `exercise_id`): the plan
    // card in installed v2.0.0 apps reads the legacy uuid and sends it to
    // create_plan.
    const ids = await asUser(userId, (tx) =>
      legacyExerciseIdsBySlug(tx, slugs)
    );
    const unmapped = slugs.filter((slug) => !ids.has(slug));
    if (unmapped.length > 0) {
      // a v2.0.0 card can't save these: the legacy table has fallen behind
      await reportError(
        new Error(
          `Exercise slugs with no legacy exercise_id: ${unmapped.join(", ")}`
        )
      );
    }
    return {
      ...input,
      workouts: input.workouts.map((workout) => ({
        ...workout,
        exercises: workout.exercises.map((exercise) => ({
          ...exercise,
          exercise_id: ids.get(exercise.exercise_slug) ?? null,
        })),
      })),
    };
  },
  inputSchema: z.object({
    description: z.string(),
    experienceLevel: z
      .enum(["beginner", "intermediate", "advanced"])
      .optional(),
    frequencyPerWeek: z.number(),
    goal: z.enum([
      "weight_loss",
      "muscle_gain",
      "strength",
      "endurance",
      "general_fitness",
    ]),
    name: z.string(),
    place: z.enum(["gym", "home"]).optional(),
    workoutDuration: z.number().optional(),
    workouts: z.array(workoutSchema),
  }),
});
