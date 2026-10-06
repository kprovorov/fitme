import { afterEach, describe, expect, it } from "vitest";
import { type Filter, failure, ok, type Route } from "./fake-supabase.js";
import {
  BENCH_ID,
  call,
  callsTo,
  connectWithFake,
  expectAllCallsRouted,
  PLAN_ID,
  SQUAT_ID,
} from "./harness.js";

afterEach(expectAllCallsRouted);

const LIVE_PLAN: Filter[] = [
  ["eq", "id", PLAN_ID],
  ["is", "deleted_at", null],
];

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

/** A plan whose workouts, exercises and sets all arrive out of order. */
const planDetail = {
  ...metadata,
  id: PLAN_ID,
  is_active: true,
  workouts: [
    {
      exercises: [],
      id: "w2",
      name: "Day B",
      order: 5,
    },
    {
      exercises: [
        {
          exercise: { id: SQUAT_ID, name: "Squat" },
          id: "we2",
          order: 2,
          sets: [{ id: "set-b", order: 1 }],
        },
        {
          exercise: { id: BENCH_ID, name: "Bench" },
          id: "we1",
          order: 1,
          sets: [
            { id: "set-2", order: 2 },
            { id: "set-1", order: 1 },
          ],
        },
      ],
      id: "w1",
      name: "Day A",
      order: 3,
    },
  ],
};

/** Plan detail read (`workouts (` only appears in the nested selects). */
const detailRoute = (response = ok(planDetail)): Route => ({
  filters: LIVE_PLAN,
  name: "plans",
  operation: "select",
  response,
  select: "sets:workout_exercise_sets",
});

const workoutsInput = [
  {
    description: "Chest and legs",
    exercises: [
      {
        exercise_id: BENCH_ID,
        sets: [
          { reps_recommended: 8, rest_recommended: 90, weight_recommended: 60 },
        ],
      },
      {
        exercise_id: SQUAT_ID,
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

const knownExercises: Route = {
  name: "exercises",
  operation: "select",
  response: ok([{ id: BENCH_ID }, { id: SQUAT_ID }]),
};

describe("list_plans", () => {
  it("lists live plans with workouts in rotation order and exercise counts", async () => {
    const { client } = await connectWithFake([
      {
        filters: [
          ["is", "deleted_at", null],
          ["order", "created_at", { ascending: false }],
        ],
        name: "plans",
        operation: "select",
        response: ok([
          {
            ...metadata,
            id: PLAN_ID,
            workouts: [
              { exercises: [], id: "w2", name: "Day B", order: 4 },
              {
                exercises: [{ id: "we1" }, { id: "we2" }],
                id: "w1",
                name: "Day A",
                order: 2,
              },
            ],
          },
        ]),
      },
    ]);

    const result = await call(client, "list_plans");

    expect(JSON.parse(result.text)).toEqual([
      {
        ...metadata,
        id: PLAN_ID,
        workouts: [
          { exercise_count: 2, id: "w1", name: "Day A", order: 2 },
          { exercise_count: 0, id: "w2", name: "Day B", order: 4 },
        ],
      },
    ]);
  });
});

describe("get_plan", () => {
  it("sorts workouts, exercises and sets by order", async () => {
    const { client } = await connectWithFake([detailRoute()]);

    const result = await call(client, "get_plan", { planId: PLAN_ID });

    const plan = result.json as typeof planDetail;
    expect(plan.workouts.map((workout) => workout.id)).toEqual(["w1", "w2"]);
    const [dayA] = plan.workouts;
    expect(dayA?.exercises.map((exercise) => exercise.id)).toEqual([
      "we1",
      "we2",
    ]);
    expect(dayA?.exercises[0]?.sets.map((set) => set.id)).toEqual([
      "set-1",
      "set-2",
    ]);
  });

  it("does not return soft-deleted or foreign plans", async () => {
    const { client } = await connectWithFake([detailRoute(ok(null))]);
    const result = await call(client, "get_plan", { planId: PLAN_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Plan ${PLAN_ID} not found`);
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

  it("lists unknown exercise ids instead of calling the RPC", async () => {
    const { client, fake } = await connectWithFake([
      {
        filters: [["in", "id", [BENCH_ID, SQUAT_ID]]],
        name: "exercises",
        operation: "select",
        response: ok([{ id: BENCH_ID }]),
      },
    ]);

    const result = await call(client, "create_plan", plan);

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Unknown exercise_id(s): ${SQUAT_ID}. Use list_exercises to look up valid exercise ids.`
    );
    expect(callsTo(fake.calls, "create_plan")).toHaveLength(0);
  });

  it("creates the plan through the RPC and returns it", async () => {
    const { client, fake } = await connectWithFake([
      knownExercises,
      { name: "create_plan", operation: "rpc", response: ok(PLAN_ID) },
      detailRoute(),
    ]);

    const result = await call(client, "create_plan", plan);

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({ id: PLAN_ID });
    const [rpc] = callsTo(fake.calls, "create_plan");
    expect(rpc?.args).toEqual({ p_plan_data: plan });
  });

  it("reports success with a warning when the read-back fails", async () => {
    const { client } = await connectWithFake([
      knownExercises,
      { name: "create_plan", operation: "rpc", response: ok(PLAN_ID) },
      detailRoute(failure("connection reset")),
    ]);

    const result = await call(client, "create_plan", plan);

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({ created: true, planId: PLAN_ID });
    expect(result.json.warning).toContain("Do not repeat the call");
  });

  it("surfaces database errors as tool errors", async () => {
    const { client } = await connectWithFake([
      knownExercises,
      {
        name: "create_plan",
        operation: "rpc",
        response: failure("permission denied for function create_plan"),
      },
    ]);
    const result = await call(client, "create_plan", plan);
    expect(result.isError).toBe(true);
    expect(result.text).toBe("permission denied for function create_plan");
  });
});

describe("update_plan", () => {
  it("updates only metadata of a live plan without touching workouts", async () => {
    const { client, fake } = await connectWithFake([
      {
        filters: LIVE_PLAN,
        name: "plans",
        operation: "update",
        response: ok([{ id: PLAN_ID }]),
      },
      detailRoute(),
    ]);

    const result = await call(client, "update_plan", {
      name: "Renamed",
      note: null,
      planId: PLAN_ID,
    });

    expect(result.isError).toBe(false);
    expect(callsTo(fake.calls, "update_plan")).toHaveLength(0);
    const [update] = callsTo(fake.calls, "plans", "update");
    expect(update?.args).toEqual({
      name: "Renamed",
      note: null,
      updated_at: expect.any(String),
    });
  });

  it("errors when the plan doesn't exist", async () => {
    const { client } = await connectWithFake([
      { name: "plans", operation: "update", response: ok([]) },
    ]);
    const result = await call(client, "update_plan", {
      frequency: 4,
      planId: PLAN_ID,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Plan ${PLAN_ID} not found`);
  });

  it("merges current metadata into the update_plan RPC when workouts change", async () => {
    const { client, fake } = await connectWithFake([
      detailRoute(),
      {
        filters: LIVE_PLAN,
        name: "plans",
        operation: "select",
        response: ok(metadata),
        select: "workout_duration, note",
      },
      knownExercises,
      { name: "update_plan", operation: "rpc", response: ok(PLAN_ID) },
    ]);

    const result = await call(client, "update_plan", {
      frequency: 4,
      planId: PLAN_ID,
      workouts: workoutsInput,
    });

    expect(result.isError).toBe(false);
    const [rpc] = callsTo(fake.calls, "update_plan");
    expect(rpc?.args).toEqual({
      p_plan_data: { ...metadata, frequency: 4, workouts: workoutsInput },
      p_plan_id: PLAN_ID,
    });
    expect(callsTo(fake.calls, "plans", "update")).toHaveLength(0);
  });

  it("reports success with a warning when the read-back fails", async () => {
    const { client } = await connectWithFake([
      detailRoute(failure("connection reset")),
      { name: "plans", operation: "select", response: ok(metadata) },
      knownExercises,
      { name: "update_plan", operation: "rpc", response: ok(PLAN_ID) },
    ]);

    const result = await call(client, "update_plan", {
      planId: PLAN_ID,
      workouts: workoutsInput,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({ planId: PLAN_ID, updated: true });
    expect(result.json.warning).toContain("get_plan");
  });

  it("rejects a call with nothing to update", async () => {
    const { client, fake } = await connectWithFake([]);
    const result = await call(client, "update_plan", { planId: PLAN_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Nothing to update");
    expect(fake.calls).toHaveLength(0);
  });
});

describe("delete_plan", () => {
  it("soft-deletes and deactivates a live plan", async () => {
    const { client, fake } = await connectWithFake([
      {
        filters: LIVE_PLAN,
        name: "plans",
        operation: "update",
        response: ok([{ id: PLAN_ID, name: "My plan" }]),
      },
    ]);

    const result = await call(client, "delete_plan", { planId: PLAN_ID });

    expect(result.json).toEqual({
      alreadyDeleted: false,
      deleted: true,
      plan: { id: PLAN_ID, name: "My plan" },
    });
    const [update] = callsTo(fake.calls, "plans", "update");
    expect(update?.args).toEqual({
      deleted_at: expect.any(String),
      is_active: false,
      updated_at: expect.any(String),
    });
  });

  it("is a no-op for an already deleted plan", async () => {
    const { client } = await connectWithFake([
      { name: "plans", operation: "update", response: ok([]) },
      {
        filters: [["eq", "id", PLAN_ID]],
        name: "plans",
        operation: "select",
        response: ok({
          deleted_at: "2026-09-01T00:00:00Z",
          id: PLAN_ID,
          name: "Old",
        }),
      },
    ]);

    const result = await call(client, "delete_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      alreadyDeleted: true,
      deleted: true,
      plan: { id: PLAN_ID, name: "Old" },
    });
  });

  it("errors for an unknown plan", async () => {
    const { client } = await connectWithFake([
      { name: "plans", operation: "update", response: ok([]) },
      { name: "plans", operation: "select", response: ok(null) },
    ]);
    const result = await call(client, "delete_plan", { planId: PLAN_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Plan ${PLAN_ID} not found`);
  });
});

describe("activate_plan", () => {
  it("refuses soft-deleted plans", async () => {
    const { client, fake } = await connectWithFake([
      {
        filters: LIVE_PLAN,
        name: "plans",
        operation: "select",
        response: ok(null),
      },
    ]);
    const result = await call(client, "activate_plan", { planId: PLAN_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Plan ${PLAN_ID} not found (it may have been deleted or belong to another user).`
    );
    expect(callsTo(fake.calls, "activate_plan")).toHaveLength(0);
  });

  it("activates through the RPC and returns the plan summary", async () => {
    const { client, fake } = await connectWithFake([
      {
        filters: LIVE_PLAN,
        name: "plans",
        operation: "select",
        response: ok({
          ...metadata,
          id: PLAN_ID,
          is_active: true,
          workouts: [
            { exercises: [{ id: "we1" }], id: "w1", name: "A", order: 1 },
          ],
        }),
        select: "exercises:workout_exercises ( id )",
      },
      {
        filters: LIVE_PLAN,
        name: "plans",
        operation: "select",
        response: ok({ id: PLAN_ID }),
        select: "id",
      },
      {
        name: "activate_plan",
        operation: "rpc",
        response: ok({ deleted_at: null, id: PLAN_ID, user_id: "user-1" }),
      },
    ]);

    const result = await call(client, "activate_plan", { planId: PLAN_ID });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      activated: true,
      plan: {
        ...metadata,
        id: PLAN_ID,
        is_active: true,
        workouts: [{ exercise_count: 1, id: "w1", name: "A", order: 1 }],
      },
    });
    const [rpc] = callsTo(fake.calls, "activate_plan");
    expect(rpc?.args).toEqual({ plan_id: PLAN_ID });
  });
});
