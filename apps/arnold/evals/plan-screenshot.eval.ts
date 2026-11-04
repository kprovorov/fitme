import { resolve } from "node:path";
import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { BENCH, INCLINE, ROW, readToolStubs, SQUAT } from "./fixtures";

/**
 * A made-up plan screen, standing in for a screenshot a User takes in another
 * training app (evals/images/plan-screenshot.html is its source): "Starter
 * Strength", 2 days a week, Day 1 Bench Press (4 sets) and Incline Dumbbell
 * Press (3), Day 2 Barbell Row (4) and Back Squat (5). Its days and its set
 * counts both differ from the stubbed active Plan, so the card can only hold
 * them if Arnold read the image.
 */
// Resolved against the working directory, which `eve eval` runs from
// apps/arnold: it compiles this file into node_modules/.cache, so
// `import.meta.url` points there rather than at the source.
const SCREENSHOT = resolve(process.cwd(), "evals/images/plan-screenshot.jpg");

const LIBRARY_SLUGS = new Set([BENCH, INCLINE, ROW, SQUAT]);
/** The Exercises of each day in the screenshot, in no particular order. */
const SCREENSHOT_DAYS = [new Set([BENCH, INCLINE]), new Set([ROW, SQUAT])];
/** The set count the screenshot shows against each Exercise. */
const SCREENSHOT_SETS = new Map([
  [BENCH, 4],
  [INCLINE, 3],
  [ROW, 4],
  [SQUAT, 5],
]);

interface ProposedPlan {
  workouts: { exercises: { exercise_slug: string; sets: number }[] }[];
}

type Workouts = ProposedPlan["workouts"];

const exercisesOf = (workouts: Workouts) =>
  workouts.flatMap(({ exercises }) => exercises);

const sameSlugs = (shown: Set<string>, expected: Set<string>) =>
  shown.size === expected.size &&
  [...expected].every((slug) => shown.has(slug));

/** Each day of the card holds exactly one of the screenshot's days. */
const matchesScreenshotDays = (workouts: Workouts) => {
  if (workouts.length !== SCREENSHOT_DAYS.length) {
    return false;
  }
  const remaining = [...SCREENSHOT_DAYS];
  for (const { exercises } of workouts) {
    const shown = new Set(exercises.map(({ exercise_slug }) => exercise_slug));
    const day = remaining.findIndex((expected) => sameSlugs(shown, expected));
    if (day === -1) {
      return false;
    }
    remaining.splice(day, 1);
  }
  return true;
};

/** Every Exercise carries over the set count the screenshot shows. */
const carriesScreenshotSets = (workouts: Workouts) => {
  const exercises = exercisesOf(workouts);
  return (
    exercises.length === SCREENSHOT_SETS.size &&
    exercises.every(
      ({ exercise_slug, sets }) => SCREENSHOT_SETS.get(exercise_slug) === sets
    )
  );
};

export default defineEval({
  description:
    "Plan screenshot: an Attachment of a plan from another app comes back as a plan card with that plan's days, by library slug.",
  async test(t) {
    const session = await t.session({ stubs: readToolStubs });
    const turn = await session.sendFile(
      "This is the plan I've been following in another app. Can you set it up for me here?",
      SCREENSHOT
    );

    t.succeeded();
    turn.calledTool("search_exercises");
    turn.calledTool("display_workout_plan", { count: 1 });
    turn.toolOrder(["search_exercises", "display_workout_plan"]);

    const display = turn.toolCalls.find(
      (call) => call.name === "display_workout_plan"
    );
    const proposed = display?.input as unknown as ProposedPlan | undefined;
    const workouts = proposed?.workouts ?? [];

    t.check(
      workouts,
      satisfies((shown: Workouts) => {
        const exercises = exercisesOf(shown);
        return (
          exercises.length > 0 &&
          exercises.every(({ exercise_slug }) =>
            LIBRARY_SLUGS.has(exercise_slug)
          )
        );
      }, "every exercise uses a slug search_exercises returned")
    ).label("slugs come from the library");

    t.check(
      workouts,
      satisfies(matchesScreenshotDays, "the two days the screenshot shows")
    ).label("the card mirrors the screenshot's Workouts");

    t.check(
      workouts,
      satisfies(carriesScreenshotSets, "the set counts the screenshot shows")
    ).label("the card carries the screenshot's sets");
  },
});
