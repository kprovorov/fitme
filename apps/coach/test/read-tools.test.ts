import {
  ExerciseLibraryRateLimitedError,
  ExerciseLibraryUnavailableError,
} from "@fitme/exercise-library";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeLibrary } from "./exercise-library";
import {
  contextFor,
  inputSchemaOf,
  type TestedTool,
  userIdFields,
} from "./tool-context";

const db = vi.hoisted(() => ({ asUser: vi.fn() }));
const plans = vi.hoisted(() => ({
  getActivePlan: vi.fn(),
  listPlans: vi.fn(),
}));
const sessions = vi.hoisted(() => ({ listWorkoutHistory: vi.fn() }));
const exerciseServices = vi.hoisted(() => ({
  legacyExerciseIdsBySlug: vi.fn(),
}));
const observability = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@fitme/db", () => db);
vi.mock("@fitme/services/plans", () => plans);
vi.mock("@fitme/services/workout-sessions", () => sessions);
vi.mock("@fitme/services/exercises", () => exerciseServices);
vi.mock("@fitme/observability/node", () => observability);
vi.mock("../agent/lib/exercise-library", async () => {
  const { fakeLibrary: library } = await import("./exercise-library");
  return { exerciseLibrary: () => library };
});

const { default: getActivePlan } = await import(
  "../agent/tools/get_active_plan"
);
const { default: getPlans } = await import("../agent/tools/get_plans");
const { default: getWorkoutsHistory } = await import(
  "../agent/tools/get_workouts_history"
);
const { default: searchExercises } = await import(
  "../agent/tools/search_exercises"
);
const { default: displayWorkoutPlan } = await import(
  "../agent/tools/display_workout_plan"
);

const tx = { fake: "transaction" };

/** What eve hands `execute` after validating the model's input. */
const parseInput = <Input>(tool: TestedTool<Input>, input: unknown) =>
  inputSchemaOf(tool).parse(input);
const alice = contextFor("user_alice");

const benchId = "c0000000-0000-4000-8000-000000000001";
const set = {
  id: "set_1",
  order: 1,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_recommended: 60,
};
/** A Workout Exercise as the services return it, legacy join included. */
const planExercise = (id: string, slug: string) => ({
  exercise: { id: benchId, muscle_groups: ["chest"], name: "Legacy name" },
  exercise_slug: slug,
  id,
  order: 1,
  sets: [set],
});
const plan = {
  id: "plan_1",
  is_active: true,
  name: "Push pull",
  workouts: [
    {
      description: "Push",
      exercises: [
        planExercise("we_bench", "bench-press"),
        planExercise("we_retired", "jefferson-curl"),
      ],
      id: "workout_1",
      name: "Push",
      order: 1,
    },
  ],
};
const loggedSet = { ...set, logged_at: null, reps_completed: 8 };
const history = [
  {
    exercises: [
      {
        exercise: { id: benchId, name: "Legacy name" },
        exercise_slug: "back-squat",
        id: "wse_squat",
        order: 1,
        sets: [loggedSet],
      },
    ],
    id: "session_1",
    status: "finished",
  },
];

beforeEach(() => {
  fakeLibrary.failWith(null);
  db.asUser.mockImplementation((_userId, fn) => fn(tx));
  plans.getActivePlan.mockResolvedValue(plan);
  plans.listPlans.mockResolvedValue([plan]);
  sessions.listWorkoutHistory.mockResolvedValue(history);
  exerciseServices.legacyExerciseIdsBySlug.mockResolvedValue(
    new Map([["bench-press", benchId]])
  );
  observability.reportError.mockResolvedValue(undefined);
});

/** Every argument asUser and the services were called with. */
const seenArguments = () =>
  JSON.stringify([
    db.asUser.mock.calls,
    plans.getActivePlan.mock.calls,
    plans.listPlans.mock.calls,
    sessions.listWorkoutHistory.mock.calls,
  ]);

const libraryDown = new ExerciseLibraryUnavailableError();

/** An Exercise as the read tools show it. */
interface ShownExercise {
  muscle_groups: string[];
  name: string;
}

describe("get_active_plan", () => {
  it("reads the active Plan as the session's User", async () => {
    const input = parseInput(getActivePlan, userIdFields);

    await getActivePlan.execute(input, alice);

    expect(input).toEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.getActivePlan).toHaveBeenCalledWith(tx, "user_alice");
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("names each Exercise from the library, and from its slug when the library doesn't know it", async () => {
    expect(await getActivePlan.execute({}, alice)).toEqual({
      ...plan,
      workouts: [
        {
          ...plan.workouts[0],
          exercises: [
            {
              exercise_slug: "bench-press",
              id: "we_bench",
              muscle_groups: ["chest", "triceps"],
              name: "Bench Press",
              order: 1,
              sets: [set],
            },
            {
              exercise_slug: "jefferson-curl",
              id: "we_retired",
              muscle_groups: [],
              name: "Jefferson curl",
              order: 1,
              sets: [set],
            },
          ],
        },
      ],
    });
  });

  it("still answers, with slug-derived names, when the library fails, and reports it", async () => {
    fakeLibrary.failWith(libraryDown);

    const answer = (await getActivePlan.execute({}, alice)) as {
      workouts: { exercises: ShownExercise[] }[];
    };

    expect(answer.workouts[0].exercises.map(({ name }) => name)).toEqual([
      "Bench press",
      "Jefferson curl",
    ]);
    expect(observability.reportError).toHaveBeenCalledWith(
      libraryDown,
      expect.anything()
    );
  });

  it("never shows the legacy exercise uuid", async () => {
    expect(
      JSON.stringify(await getActivePlan.execute({}, alice))
    ).not.toContain(benchId);
  });

  it("tells the model when no Plan is active", async () => {
    plans.getActivePlan.mockResolvedValue(null);

    expect(await getActivePlan.execute({}, alice)).toEqual({
      error: "No active plan found",
    });
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(getActivePlan.execute({}, contextFor(null))).rejects.toThrow();
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("get_plans", () => {
  it("lists the Plans as the session's User", async () => {
    const input = parseInput(getPlans, userIdFields);

    expect(await getPlans.execute(input, alice)).toEqual([plan]);
    expect(input).toEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.listPlans).toHaveBeenCalledWith(tx, "user_alice");
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(getPlans.execute({}, contextFor(null))).rejects.toThrow();
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("get_workouts_history", () => {
  it("reads the latest finished sessions as the session's User, Exercises named from the library", async () => {
    const input = parseInput(getWorkoutsHistory, { ...userIdFields, limit: 3 });

    expect(await getWorkoutsHistory.execute(input, alice)).toEqual([
      {
        ...history[0],
        exercises: [
          {
            exercise_slug: "back-squat",
            id: "wse_squat",
            muscle_groups: ["quadriceps", "glutes"],
            name: "Back Squat",
            order: 1,
            sets: [loggedSet],
          },
        ],
      },
    ]);
    expect(input).toEqual({ limit: 3 });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(sessions.listWorkoutHistory).toHaveBeenCalledWith(tx, { limit: 3 });
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("still answers, with slug-derived names, when the library fails", async () => {
    fakeLibrary.failWith(new ExerciseLibraryRateLimitedError(30));

    const [session] = (await getWorkoutsHistory.execute(
      { limit: 10 },
      alice
    )) as { exercises: ShownExercise[] }[];

    expect(session.exercises[0]).toMatchObject({
      muscle_groups: [],
      name: "Back squat",
    });
    expect(observability.reportError).toHaveBeenCalled();
  });

  it("reads 10 sessions by default and at most 20", () => {
    expect(parseInput(getWorkoutsHistory, {})).toEqual({ limit: 10 });
    expect(() => parseInput(getWorkoutsHistory, { limit: 21 })).toThrow();
    expect(() => parseInput(getWorkoutsHistory, { limit: 0 })).toThrow();
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      getWorkoutsHistory.execute({ limit: 10 }, contextFor(null))
    ).rejects.toThrow();
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("search_exercises", () => {
  it("searches the library by name and muscle group, answering slugs", async () => {
    const input = parseInput(searchExercises, {
      ...userIdFields,
      muscle_group: "chest",
      query: "press",
    });

    expect(await searchExercises.execute(input, alice)).toEqual([
      {
        exercise_slug: "bench-press",
        muscle_groups: ["chest", "triceps"],
        name: "Bench Press",
      },
      {
        exercise_slug: "incline-dumbbell-press",
        muscle_groups: ["chest"],
        name: "Incline Dumbbell Press",
      },
    ]);
    expect(input).toEqual({ muscle_group: "chest", query: "press" });
  });

  it("asks the library for the first 8 matches", async () => {
    const list = vi.spyOn(fakeLibrary, "list");

    await searchExercises.execute({ query: "squat" }, alice);

    expect(list).toHaveBeenCalledWith({
      limit: 8,
      muscleGroup: undefined,
      search: "squat",
    });
  });

  it("only takes a known muscle group", () => {
    expect(() =>
      parseInput(searchExercises, { muscle_group: "wings" })
    ).toThrow();
  });

  it("asks to retry when the library fails, and reports it", async () => {
    fakeLibrary.failWith(libraryDown);

    expect(await searchExercises.execute({}, alice)).toEqual({
      error: expect.stringContaining("Try again"),
    });
    expect(observability.reportError).toHaveBeenCalledWith(
      libraryDown,
      expect.anything()
    );
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      searchExercises.execute({}, contextFor(null))
    ).rejects.toThrow();
  });
});

describe("display_workout_plan", () => {
  const exercise = (slug: string, name: string) => ({
    exercise_slug: slug,
    name,
    reps: "8-10",
    sets: 3,
  });
  const proposed = (...exercises: ReturnType<typeof exercise>[]) => ({
    description: "Three full-body days",
    frequencyPerWeek: 3,
    goal: "muscle_gain",
    name: "Full body",
    workouts: [{ dayLabel: "Monday", exercises, name: "Day A" }],
  });
  const run = (input: unknown) =>
    displayWorkoutPlan.execute(parseInput(displayWorkoutPlan, input), alice);

  it("returns the proposed Plan with both exercise_slug and the legacy exercise_id", async () => {
    const card = proposed(exercise("bench-press", "Bench press"));

    expect(await run(card)).toEqual({
      ...card,
      workouts: [
        {
          ...card.workouts[0],
          exercises: [
            {
              exercise_id: benchId,
              exercise_slug: "bench-press",
              name: "Bench press",
              reps: "8-10",
              sets: 3,
            },
          ],
        },
      ],
    });
    expect(exerciseServices.legacyExerciseIdsBySlug).toHaveBeenCalledWith(tx, [
      "bench-press",
    ]);
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
  });

  it("refuses a slug the library doesn't know", async () => {
    expect(await run(proposed(exercise("made-up-fly", "Fly")))).toEqual({
      error: expect.stringContaining("made-up-fly"),
    });
    expect(exerciseServices.legacyExerciseIdsBySlug).not.toHaveBeenCalled();
  });

  it("asks to retry when the library fails", async () => {
    fakeLibrary.failWith(libraryDown);

    expect(await run(proposed(exercise("bench-press", "Bench")))).toEqual({
      error: expect.stringContaining("Try again"),
    });
  });
});
