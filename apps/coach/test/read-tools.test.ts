import { beforeEach, describe, expect, it, vi } from "vitest";
import { contextFor, inputSchemaOf, userIdFields } from "./tool-context";

const db = vi.hoisted(() => ({ asUser: vi.fn() }));
const plans = vi.hoisted(() => ({
  getActivePlan: vi.fn(),
  listPlans: vi.fn(),
}));
const sessions = vi.hoisted(() => ({ listWorkoutHistory: vi.fn() }));
const exercises = vi.hoisted(() => ({ listExercises: vi.fn() }));
vi.mock("@fitme/db", () => db);
vi.mock("@fitme/services/plans", () => plans);
vi.mock("@fitme/services/workout-sessions", () => sessions);
vi.mock("@fitme/services/exercises", () => exercises);

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
const parseInput = <Input>(
  tool: Parameters<typeof inputSchemaOf<Input>>[0],
  input: unknown
) => inputSchemaOf(tool).parse(input);
const alice = contextFor("user_alice");

const plan = { id: "plan_1", is_active: true, name: "Push pull", workouts: [] };
const history = [{ exercises: [], id: "session_1", status: "finished" }];
const bench = {
  description: "Press it",
  id: "exercise_bench",
  muscle_groups: ["chest"],
  name: "Bench press",
  slug: "bench-press",
};

beforeEach(() => {
  db.asUser.mockImplementation((_userId, fn) => fn(tx));
  plans.getActivePlan.mockResolvedValue(plan);
  plans.listPlans.mockResolvedValue([plan]);
  sessions.listWorkoutHistory.mockResolvedValue(history);
  exercises.listExercises.mockResolvedValue({
    exercises: [bench],
    hasMore: false,
    limit: 8,
    offset: 0,
    total: 1,
  });
});

/** Every argument asUser and the services were called with. */
const seenArguments = () =>
  JSON.stringify([
    db.asUser.mock.calls,
    plans.getActivePlan.mock.calls,
    plans.listPlans.mock.calls,
    sessions.listWorkoutHistory.mock.calls,
    exercises.listExercises.mock.calls,
  ]);

describe("get_active_plan", () => {
  it("reads the active Plan as the session's User", async () => {
    const input = parseInput(getActivePlan, userIdFields);

    expect(await getActivePlan.execute(input, alice)).toEqual(plan);
    expect(input).toEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.getActivePlan).toHaveBeenCalledWith(tx, "user_alice");
    expect(seenArguments()).not.toContain("user_mallory");
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
  it("reads the latest finished sessions as the session's User", async () => {
    const input = parseInput(getWorkoutsHistory, { ...userIdFields, limit: 3 });

    expect(await getWorkoutsHistory.execute(input, alice)).toEqual(history);
    expect(input).toEqual({ limit: 3 });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(sessions.listWorkoutHistory).toHaveBeenCalledWith(tx, { limit: 3 });
    expect(seenArguments()).not.toContain("user_mallory");
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
  it("searches the first 8 matches by name and muscle group as the session's User", async () => {
    const input = parseInput(searchExercises, {
      ...userIdFields,
      muscle_group: "chest",
      query: "bench",
    });

    expect(await searchExercises.execute(input, alice)).toEqual([
      { id: "exercise_bench", muscle_groups: ["chest"], name: "Bench press" },
    ]);
    expect(input).toEqual({ muscle_group: "chest", query: "bench" });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(exercises.listExercises).toHaveBeenCalledWith(tx, {
      limit: 8,
      muscleGroup: "chest",
      offset: 0,
      search: "bench",
    });
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("searches without filters when given none", async () => {
    await searchExercises.execute({}, alice);

    expect(exercises.listExercises).toHaveBeenCalledWith(tx, {
      limit: 8,
      muscleGroup: undefined,
      offset: 0,
      search: undefined,
    });
  });

  it("only takes a known muscle group", () => {
    expect(() =>
      parseInput(searchExercises, { muscle_group: "wings" })
    ).toThrow();
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      searchExercises.execute({}, contextFor(null))
    ).rejects.toThrow();
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("display_workout_plan", () => {
  const proposed = {
    description: "Three full-body days",
    frequencyPerWeek: 3,
    goal: "muscle_gain",
    name: "Full body",
    workouts: [
      {
        dayLabel: "Monday",
        exercises: [
          {
            exercise_id: "exercise_bench",
            name: "Bench press",
            reps: "8-10",
            sets: 3,
          },
        ],
        name: "Day A",
      },
    ],
  };

  it("returns the proposed Plan as given, touching no data", async () => {
    const input = parseInput(displayWorkoutPlan, proposed);

    expect(await displayWorkoutPlan.execute(input, alice)).toEqual(proposed);
    expect(db.asUser).not.toHaveBeenCalled();
  });
});
