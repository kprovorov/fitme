import { LibraryUnavailableError } from "@fitme/library-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  BENCH,
  call,
  connectWithServices,
  fakeLibrary,
  ignoreReports,
  PLAN_ID,
  recordingReporter,
  SQUAT,
} from "./harness.js";

/** An Exercise uuid, as tools took Exercises before slugs. */
const BENCH_ID = "55555555-5555-4555-8555-555555555555";

const UNAVAILABLE = "Library unavailable, try again.";

/** A fake library that fails every call, as when the API is down. */
const downLibrary = () => {
  const library = fakeLibrary();
  library.failWith(new LibraryUnavailableError({ status: 503 }));
  return library;
};

const metadata = {
  description: "Upper/lower split",
  experience_level: "intermediate",
  frequency: 3,
  goal: "muscle-gain",
  name: "My plan",
  note: "Keep it",
  place: "gym",
  workout_duration: 60,
};

const workoutsInput = [
  {
    description: "Chest and legs",
    exercises: [
      {
        exercise_slug: BENCH.slug,
        sets: [
          { reps_recommended: 8, rest_recommended: 90, weight_recommended: 60 },
        ],
      },
      {
        exercise_slug: SQUAT.slug,
        sets: [
          {
            reps_recommended: 5,
            rest_recommended: 120,
            weight_recommended: 100,
          },
        ],
      },
    ],
    name: "Day A",
  },
];

const planSummary = {
  ...metadata,
  created_at: "2026-10-01T10:00:00+00:00",
  id: PLAN_ID,
  is_active: true,
  updated_at: "2026-10-02T10:00:00+00:00",
  workouts: [
    { exercise_count: 2, id: "w1", name: "Day A", order: 1 },
    { exercise_count: 0, id: "w2", name: "Day B", order: 2 },
  ],
};

const planSet = {
  id: "set-1",
  order: 1,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_recommended: 60,
};

/** A Plan as the services return it: each Exercise by its slug only. */
const servicePlanWith = (slug: string) => ({
  ...planSummary,
  workouts: [
    {
      description: "Chest",
      exercises: [
        {
          exercise_slug: slug,
          id: "we1",
          order: 1,
          sets: [planSet],
        },
      ],
      id: "w1",
      name: "Day A",
      order: 1,
    },
  ],
});

/** The Plan as the tools return it: the Exercise by slug, named by the library. */
const toolPlanWith = (exercise: {
  exercise_slug: string;
  muscle_groups: string[];
  name: string;
}) => ({
  ...planSummary,
  workouts: [
    {
      description: "Chest",
      exercises: [{ ...exercise, id: "we1", order: 1, sets: [planSet] }],
      id: "w1",
      name: "Day A",
      order: 1,
    },
  ],
});

const servicePlan = servicePlanWith(BENCH.slug);
const toolPlan = toolPlanWith({
  exercise_slug: BENCH.slug,
  muscle_groups: BENCH.muscle_groups,
  name: BENCH.name,
});
const unknownToolPlan = toolPlanWith({
  exercise_slug: "cable-fly-legacy",
  muscle_groups: [],
  name: "Cable fly legacy",
});

/** A database failure as Drizzle reports it: the SQL, with pg's error as cause. */
const failedQuery = (message: string) =>
  new Error('Failed query: select "id" from "plans"\nparams: user_1', {
    cause: Object.assign(new Error(message), { code: "57014" }),
  });

describe("list_plans", () => {
  it("returns the User's plans from the service", async () => {
    const client = await connectWithServices({
      listPlans: () => Promise.resolve([planSummary]),
    });

    const result = await call(client, "list_plans");

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual([planSummary]);
  });

  it("returns an empty list for a User without plans", async () => {
    const client = await connectWithServices({
      listPlans: () => Promise.resolve([]),
    });
    expect(JSON.parse((await call(client, "list_plans")).text)).toEqual([]);
  });

  it("reports a database failure as a tool error without the SQL", async () => {
    const client = await connectWithServices({
      listPlans: () => Promise.reject(failedQuery("canceling statement")),
    });

    const result = await call(client, "list_plans");

    expect(result.isError).toBe(true);
    expect(result.text).toBe("canceling statement");
  });
});

describe("get_plan", () => {
  it("returns the plan in full, each Exercise by slug with its library name", async () => {
    const getPlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices({ getPlan });

    const result = await call(client, "get_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(toolPlan);
    expect(getPlan).toHaveBeenCalledWith(PLAN_ID);
  });

  it("names an Exercise the library doesn't know from its slug", async () => {
    const client = await connectWithServices({
      getPlan: () => Promise.resolve(servicePlanWith("cable-fly-legacy")),
    });

    const result = await call(client, "get_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(unknownToolPlan);
  });

  it("still answers, with slug-derived names, when the library fails, and reports it", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices(
      { getPlan: () => Promise.resolve(servicePlan) },
      reportError,
      downLibrary()
    );

    const result = await call(client, "get_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(
      toolPlanWith({
        exercise_slug: BENCH.slug,
        muscle_groups: [],
        name: "Bench press",
      })
    );
    expect(reported).toEqual([expect.any(LibraryUnavailableError)]);
  });

  it("does not return soft-deleted or foreign plans", async () => {
    const client = await connectWithServices({
      getPlan: () => Promise.resolve(null),
    });
    const result = await call(client, "get_plan", { planId: PLAN_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Plan ${PLAN_ID} not found (it may have been deleted or belong to another user).`
    );
  });

  it("rejects a plan id that isn't a uuid", async () => {
    const getPlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices({ getPlan });

    const result = await call(client, "get_plan", { planId: "plan-1" });

    expect(result.isError).toBe(true);
    expect(getPlan).not.toHaveBeenCalled();
  });
});

describe("create_plan", () => {
  const plan = {
    description: "Two-day plan",
    experience_level: "beginner",
    frequency: 2,
    goal: "general-health-fitness",
    name: "Starter",
    place: "gym",
    workout_duration: 45,
    workouts: workoutsInput,
  };

  it("creates the plan with exercise_slug through the service and returns it named", async () => {
    const createPlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices({ createPlan });

    const result = await call(client, "create_plan", plan);

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(toolPlan);
    expect(createPlan).toHaveBeenCalledWith(plan);
  });

  it("rejects unknown Exercise slugs, naming them, before calling the service", async () => {
    const createPlan = vi.fn(() => Promise.resolve(servicePlan));
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices({ createPlan }, reportError);
    const [workout] = workoutsInput;

    const result = await call(client, "create_plan", {
      ...plan,
      workouts: [
        {
          ...workout,
          exercises: [
            ...workout.exercises,
            { ...workout.exercises[0], exercise_slug: "nope-press" },
            { ...workout.exercises[0], exercise_slug: "nope-curl" },
          ],
        },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      "Unknown exercise_slug(s): nope-press, nope-curl. Use list_exercises to look up valid Exercise slugs."
    );
    expect(createPlan).not.toHaveBeenCalled();
    expect(reported).toEqual([]);
  });

  it("fails when the library is unavailable, reports it and writes nothing", async () => {
    const createPlan = vi.fn(() => Promise.resolve(servicePlan));
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices(
      { createPlan },
      reportError,
      downLibrary()
    );

    const result = await call(client, "create_plan", plan);

    expect(result.isError).toBe(true);
    expect(result.text).toBe(UNAVAILABLE);
    expect(createPlan).not.toHaveBeenCalled();
    expect(reported).toEqual([expect.any(LibraryUnavailableError)]);
  });

  it("rejects an exercise_id instead of an exercise_slug", async () => {
    const createPlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices({ createPlan });
    const [workout] = workoutsInput;

    const result = await call(client, "create_plan", {
      ...plan,
      workouts: [
        {
          ...workout,
          exercises: [{ exercise_id: BENCH_ID, sets: [planSet] }],
        },
      ],
    });

    expect(result.isError).toBe(true);
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("rejects a plan without workouts before calling the service", async () => {
    const createPlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices({ createPlan });

    const result = await call(client, "create_plan", { ...plan, workouts: [] });

    expect(result.isError).toBe(true);
    expect(createPlan).not.toHaveBeenCalled();
  });

  it("reports a database failure as a tool error without the SQL", async () => {
    const client = await connectWithServices({
      createPlan: () => Promise.reject(failedQuery("deadlock detected")),
    });

    const result = await call(client, "create_plan", plan);

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock detected");
  });
});

describe("update_plan", () => {
  it("passes only the given metadata fields to the service", async () => {
    const updatePlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices({ updatePlan });

    const result = await call(client, "update_plan", {
      name: "Renamed",
      note: null,
      planId: PLAN_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(toolPlan);
    expect(updatePlan).toHaveBeenCalledWith(PLAN_ID, {
      name: "Renamed",
      note: null,
    });
  });

  it("updates metadata, with slug-derived names, when the library fails", async () => {
    const updatePlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices(
      { updatePlan },
      ignoreReports,
      downLibrary()
    );

    const result = await call(client, "update_plan", {
      name: "Renamed",
      planId: PLAN_ID,
    });

    expect(result.isError).toBe(false);
    expect(updatePlan).toHaveBeenCalled();
    expect(result.json).toMatchObject({
      workouts: [{ exercises: [{ name: "Bench press" }] }],
    });
  });

  it("passes the workouts that replace the plan's", async () => {
    const updatePlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices({ updatePlan });

    const result = await call(client, "update_plan", {
      frequency: 4,
      planId: PLAN_ID,
      workouts: workoutsInput,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(toolPlan);
    expect(updatePlan).toHaveBeenCalledWith(PLAN_ID, {
      frequency: 4,
      workouts: workoutsInput,
    });
  });

  it("fails replacing workouts when the library is unavailable, writing nothing", async () => {
    const updatePlan = vi.fn(() => Promise.resolve(servicePlan));
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices(
      { updatePlan },
      reportError,
      downLibrary()
    );

    const result = await call(client, "update_plan", {
      planId: PLAN_ID,
      workouts: workoutsInput,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(UNAVAILABLE);
    expect(updatePlan).not.toHaveBeenCalled();
    expect(reported).toHaveLength(1);
  });

  it("errors for a missing, deleted or foreign plan", async () => {
    const client = await connectWithServices({
      updatePlan: () => Promise.resolve(null),
    });

    const result = await call(client, "update_plan", {
      frequency: 4,
      planId: PLAN_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Plan ${PLAN_ID} not found (it may have been deleted or belong to another user).`
    );
  });

  it("rejects unknown Exercise slugs before calling the service", async () => {
    const updatePlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices(
      { updatePlan },
      ignoreReports,
      fakeLibrary([BENCH])
    );

    const result = await call(client, "update_plan", {
      planId: PLAN_ID,
      workouts: workoutsInput,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Unknown exercise_slug(s): ${SQUAT.slug}. Use list_exercises to look up valid Exercise slugs.`
    );
    expect(updatePlan).not.toHaveBeenCalled();
  });

  it("rejects a call with nothing to update", async () => {
    const updatePlan = vi.fn(() => Promise.resolve(servicePlan));
    const client = await connectWithServices({ updatePlan });

    const result = await call(client, "update_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Nothing to update");
    expect(updatePlan).not.toHaveBeenCalled();
  });

  it("reports a database failure as a tool error without the SQL", async () => {
    const client = await connectWithServices({
      updatePlan: () => Promise.reject(failedQuery("deadlock detected")),
    });

    const result = await call(client, "update_plan", {
      name: "Renamed",
      planId: PLAN_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock detected");
  });
});

describe("delete_plan", () => {
  it("soft-deletes a live plan", async () => {
    const deletePlan = vi.fn(() =>
      Promise.resolve({
        alreadyDeleted: false,
        deleted: true as const,
        plan: { id: PLAN_ID, name: "My plan" },
      })
    );
    const client = await connectWithServices({ deletePlan });

    const result = await call(client, "delete_plan", { planId: PLAN_ID });

    expect(result.json).toEqual({
      alreadyDeleted: false,
      deleted: true,
      plan: { id: PLAN_ID, name: "My plan" },
    });
    expect(deletePlan).toHaveBeenCalledWith(PLAN_ID);
  });

  it("is a no-op for an already deleted plan", async () => {
    const client = await connectWithServices({
      deletePlan: () =>
        Promise.resolve({
          alreadyDeleted: true,
          deleted: true as const,
          plan: { id: PLAN_ID, name: "Old" },
        }),
    });

    const result = await call(client, "delete_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      alreadyDeleted: true,
      deleted: true,
      plan: { id: PLAN_ID, name: "Old" },
    });
  });

  it("errors for an unknown plan", async () => {
    const client = await connectWithServices({
      deletePlan: () => Promise.resolve(null),
    });
    const result = await call(client, "delete_plan", { planId: PLAN_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Plan ${PLAN_ID} not found`);
  });

  it("reports a database failure as a tool error without the SQL", async () => {
    const client = await connectWithServices({
      deletePlan: () => Promise.reject(failedQuery("deadlock detected")),
    });

    const result = await call(client, "delete_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock detected");
  });
});

describe("activate_plan", () => {
  it("activates the plan and returns its summary", async () => {
    const activatePlan = vi.fn(() =>
      Promise.resolve({ ...planSummary, is_active: true })
    );
    const client = await connectWithServices({ activatePlan });

    const result = await call(client, "activate_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      activated: true,
      plan: { ...planSummary, is_active: true },
    });
    expect(activatePlan).toHaveBeenCalledWith(PLAN_ID);
  });

  it("errors for a missing, deleted or foreign plan", async () => {
    const client = await connectWithServices({
      activatePlan: () => Promise.resolve(null),
    });

    const result = await call(client, "activate_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Plan ${PLAN_ID} not found (it may have been deleted or belong to another user).`
    );
  });

  it("rejects a plan id that isn't a uuid", async () => {
    const activatePlan = vi.fn();
    const client = await connectWithServices({ activatePlan });

    const result = await call(client, "activate_plan", { planId: "nope" });

    expect(result.isError).toBe(true);
    expect(activatePlan).not.toHaveBeenCalled();
  });

  it("reports a database failure as a tool error without the SQL", async () => {
    const client = await connectWithServices({
      activatePlan: () => Promise.reject(failedQuery("deadlock detected")),
    });

    const result = await call(client, "activate_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock detected");
  });
});
