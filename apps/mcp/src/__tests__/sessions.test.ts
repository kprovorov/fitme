import { afterEach, describe, expect, it } from "vitest";
import { type Filter, failure, ok, type Route } from "./fake-supabase.js";
import {
  call,
  callsTo,
  connectWithFake,
  expectAllCallsRouted,
  SESSION_ID,
  SET_ID,
  WORKOUT_ID,
} from "./harness.js";

afterEach(expectAllCallsRouted);

const FINISHED_AT = "2026-10-01T11:00:00Z";

/** A session whose exercises and sets arrive out of order. */
const sessionDetail = (finishedAt: string | null = null) => ({
  exercises: [
    {
      exercise: { id: "squat", name: "Squat" },
      id: "wse-2",
      order: 2,
      sets: [{ id: "set-c", order: 1 }],
    },
    {
      exercise: { id: "bench", name: "Bench" },
      id: "wse-1",
      order: 1,
      sets: [
        { id: "set-b", order: 2 },
        { id: "set-a", order: 1 },
      ],
    },
  ],
  finished_at: finishedAt,
  id: SESSION_ID,
  plan: { id: "plan", name: "Plan" },
  started_at: "2026-10-01T10:00:00Z",
  workout: { id: WORKOUT_ID, name: "Day A" },
});

/** Full session read (only the detail select embeds `exercise:exercises`). */
const detailRoute = (
  response = ok(sessionDetail(FINISHED_AT)),
  id = SESSION_ID
): Route => ({
  filters: [["eq", "id", id]],
  name: "workout_sessions",
  operation: "select",
  response,
  select: "exercise:exercises",
});

const stateRoute = (
  state: { finished_at: string | null; workout_id: string | null },
  once = false
): Route => ({
  filters: [["eq", "id", SESSION_ID]],
  name: "workout_sessions",
  once,
  operation: "select",
  response: ok({ id: SESSION_ID, ...state }),
  select: "workout_id",
});

const OPEN_FINISH_FILTERS: Filter[] = [
  ["eq", "id", SESSION_ID],
  ["is", "finished_at", null],
];

describe("start_workout_session", () => {
  const liveWorkout: Route = {
    filters: [
      ["eq", "id", WORKOUT_ID],
      ["is", "plan.deleted_at", null],
    ],
    name: "workouts",
    operation: "select",
    response: ok({ id: WORKOUT_ID, plan: { id: "plan" } }),
    select: "plans!inner",
  };

  const noOpenSession: Route = {
    filters: [
      ["eq", "workout_id", WORKOUT_ID],
      ["is", "finished_at", null],
    ],
    name: "workout_sessions",
    operation: "select",
    response: ok([]),
    select: "id",
  };

  it("refuses workouts whose plan was soft-deleted", async () => {
    const { client, fake } = await connectWithFake([
      { ...liveWorkout, response: ok(null) },
    ]);

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Workout ${WORKOUT_ID} not found`);
    expect(callsTo(fake.calls, "start_workout_session")).toHaveLength(0);
  });

  it("resumes the open session of that workout instead of starting another", async () => {
    const { client, fake } = await connectWithFake([
      liveWorkout,
      detailRoute(ok(sessionDetail())),
      { ...noOpenSession, response: ok([{ id: SESSION_ID }]) },
    ]);

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      resumed: true,
      session: { id: SESSION_ID, status: "in_progress" },
    });
    expect(callsTo(fake.calls, "start_workout_session")).toHaveLength(0);
  });

  it("starts a new session through the RPC and returns it sorted", async () => {
    const { client, fake } = await connectWithFake([
      liveWorkout,
      detailRoute(ok(sessionDetail())),
      noOpenSession,
      {
        name: "start_workout_session",
        operation: "rpc",
        response: ok(SESSION_ID),
      },
    ]);

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.json.resumed).toBe(false);
    const session = result.json.session as ReturnType<typeof sessionDetail>;
    expect(session.exercises.map((exercise) => exercise.id)).toEqual([
      "wse-1",
      "wse-2",
    ]);
    expect(session.exercises[0]?.sets.map((set) => set.id)).toEqual([
      "set-a",
      "set-b",
    ]);
    const [rpc] = callsTo(fake.calls, "start_workout_session");
    expect(rpc?.args).toEqual({ p_workout_id: WORKOUT_ID });
  });

  it("reports success with a warning when the read-back fails", async () => {
    const { client } = await connectWithFake([
      liveWorkout,
      detailRoute(failure("connection reset")),
      noOpenSession,
      {
        name: "start_workout_session",
        operation: "rpc",
        response: ok(SESSION_ID),
      },
    ]);

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      resumed: false,
      sessionId: SESSION_ID,
    });
    expect(result.json.warning).toContain("get_workout_session");
  });
});

describe("get_workout_session", () => {
  it("returns exercises and sets in order with a status", async () => {
    const { client } = await connectWithFake([detailRoute()]);

    const result = await call(client, "get_workout_session", {
      sessionId: SESSION_ID,
    });

    const session = result.json as ReturnType<typeof sessionDetail> & {
      status: string;
    };
    expect(session.status).toBe("finished");
    expect(session.exercises.map((exercise) => exercise.id)).toEqual([
      "wse-1",
      "wse-2",
    ]);
  });

  it("errors for an unknown session", async () => {
    const { client } = await connectWithFake([detailRoute(ok(null))]);
    const result = await call(client, "get_workout_session", {
      sessionId: SESSION_ID,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Workout session ${SESSION_ID} not found`);
  });
});

describe("list_workout_sessions", () => {
  const summaryRow = {
    exercises: [
      { id: "wse-1", sets: [{ logged_at: FINISHED_AT }, { logged_at: null }] },
      { id: "wse-2", sets: [{ logged_at: FINISHED_AT }] },
    ],
    finished_at: null,
    id: SESSION_ID,
    plan: null,
    started_at: "2026-10-01T10:00:00Z",
    workout: null,
  };

  it("filters in-progress sessions and counts logged sets", async () => {
    const { client } = await connectWithFake([
      {
        filters: [
          ["is", "finished_at", null],
          ["order", "started_at", { ascending: false }],
          ["order", "id"],
          ["range", 0, 9],
        ],
        head: false,
        name: "workout_sessions",
        operation: "select",
        response: ok([summaryRow], 1),
      },
    ]);

    const result = await call(client, "list_workout_sessions", {
      limit: 10,
      status: "in_progress",
    });

    expect(result.json).toEqual({
      hasMore: false,
      limit: 10,
      offset: 0,
      sessions: [
        {
          exercise_count: 2,
          finished_at: null,
          id: SESSION_ID,
          logged_set_count: 2,
          plan: null,
          set_count: 3,
          started_at: "2026-10-01T10:00:00Z",
          status: "in_progress",
          workout: null,
        },
      ],
      total: 1,
    });
  });

  it("filters finished sessions and handles an offset past the end", async () => {
    const finishedOnly: Filter = ["not", "finished_at", "is", null];
    const { client } = await connectWithFake([
      {
        filters: [finishedOnly],
        head: false,
        name: "workout_sessions",
        operation: "select",
        response: failure("Requested range not satisfiable", "PGRST103"),
      },
      {
        filters: [finishedOnly],
        head: true,
        name: "workout_sessions",
        operation: "select",
        response: ok(null, 3),
      },
    ]);

    const result = await call(client, "list_workout_sessions", {
      offset: 20,
      status: "finished",
    });

    expect(result.json).toMatchObject({
      hasMore: false,
      sessions: [],
      total: 3,
    });
  });
});

describe("log_set", () => {
  const args = { repsCompleted: 8, setId: SET_ID, weightCompleted: 62.5 };

  const setLookup = (finishedAt: string | null): Route => ({
    filters: [["eq", "id", SET_ID]],
    name: "workout_session_exercise_sets",
    operation: "select",
    response: ok({
      id: SET_ID,
      session_exercise: {
        session: { finished_at: finishedAt, id: SESSION_ID },
      },
    }),
  });

  it("errors when no set matches (e.g. another user's set)", async () => {
    const { client, fake } = await connectWithFake([
      { ...setLookup(null), response: ok(null) },
    ]);

    const result = await call(client, "log_set", args);

    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Set ${SET_ID} not found`);
    expect(
      callsTo(fake.calls, "workout_session_exercise_sets", "update")
    ).toHaveLength(0);
  });

  it("refuses to log into a finished session", async () => {
    const { client } = await connectWithFake([setLookup(FINISHED_AT)]);
    const result = await call(client, "log_set", args);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("can no longer be logged");
  });

  it("stores reps, weight and logged_at like the app", async () => {
    const { client, fake } = await connectWithFake([
      setLookup(null),
      {
        filters: [["eq", "id", SET_ID]],
        name: "workout_session_exercise_sets",
        operation: "update",
        response: ok({ id: SET_ID, reps_completed: 8, weight_completed: 62.5 }),
      },
    ]);

    const result = await call(client, "log_set", args);

    expect(result.isError).toBe(false);
    const [update] = callsTo(
      fake.calls,
      "workout_session_exercise_sets",
      "update"
    );
    expect(update?.args).toEqual({
      logged_at: expect.any(String),
      reps_completed: 8,
      weight_completed: 62.5,
    });
  });
});

describe("finish_workout_session", () => {
  const finishRpc = (response = ok(null)): Route => ({
    name: "finish_workout_session",
    operation: "rpc",
    response,
  });

  it("short-circuits an already finished session", async () => {
    const { client, fake } = await connectWithFake([
      stateRoute({ finished_at: FINISHED_AT, workout_id: WORKOUT_ID }),
      detailRoute(),
    ]);

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.json).toMatchObject({
      alreadyFinished: true,
      rotated: false,
    });
    expect(callsTo(fake.calls, "finish_workout_session")).toHaveLength(0);
    expect(callsTo(fake.calls, "workout_sessions", "update")).toHaveLength(0);
  });

  it("uses the RPC (which rotates the workout) for linked sessions", async () => {
    const { client, fake } = await connectWithFake([
      stateRoute({ finished_at: null, workout_id: WORKOUT_ID }),
      finishRpc(),
      detailRoute(),
    ]);

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.json).toMatchObject({
      alreadyFinished: false,
      rotated: true,
      session: { status: "finished" },
    });
    const [rpc] = callsTo(fake.calls, "finish_workout_session");
    expect(rpc?.args).toEqual({ p_session_id: SESSION_ID });
  });

  it("falls back to a guarded direct update when the workout was deleted", async () => {
    const { client, fake } = await connectWithFake([
      stateRoute({ finished_at: null, workout_id: null }),
      {
        filters: OPEN_FINISH_FILTERS,
        name: "workout_sessions",
        operation: "update",
        response: ok([{ id: SESSION_ID }]),
      },
      detailRoute(),
    ]);

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.json).toMatchObject({
      alreadyFinished: false,
      rotated: false,
    });
    expect(callsTo(fake.calls, "finish_workout_session")).toHaveLength(0);
    const [update] = callsTo(fake.calls, "workout_sessions", "update");
    expect(update?.args).toEqual({ finished_at: expect.any(String) });
  });

  it("reports alreadyFinished when the RPC fails because the session was finished meanwhile", async () => {
    const { client } = await connectWithFake([
      stateRoute({ finished_at: null, workout_id: WORKOUT_ID }, true),
      stateRoute({ finished_at: FINISHED_AT, workout_id: WORKOUT_ID }),
      finishRpc(failure("could not serialize access")),
      detailRoute(),
    ]);

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      alreadyFinished: true,
      rotated: false,
    });
  });

  it("falls back when the workout disappeared between the check and the RPC", async () => {
    const { client, fake } = await connectWithFake([
      stateRoute({ finished_at: null, workout_id: WORKOUT_ID }, true),
      stateRoute({ finished_at: null, workout_id: null }),
      finishRpc(failure("Session not found or not authorized")),
      {
        filters: OPEN_FINISH_FILTERS,
        name: "workout_sessions",
        operation: "update",
        response: ok([{ id: SESSION_ID }]),
      },
      detailRoute(),
    ]);

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.json).toMatchObject({
      alreadyFinished: false,
      rotated: false,
    });
    expect(callsTo(fake.calls, "workout_sessions", "update")).toHaveLength(1);
  });

  it("reports alreadyFinished when the fallback update matched nothing because of a race", async () => {
    const { client } = await connectWithFake([
      stateRoute({ finished_at: null, workout_id: null }, true),
      stateRoute({ finished_at: FINISHED_AT, workout_id: null }),
      { name: "workout_sessions", operation: "update", response: ok([]) },
      detailRoute(),
    ]);

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.json).toMatchObject({
      alreadyFinished: true,
      rotated: false,
    });
  });

  it("surfaces the RPC error when the session is still open", async () => {
    const { client } = await connectWithFake([
      stateRoute({ finished_at: null, workout_id: WORKOUT_ID }),
      finishRpc(failure("deadlock detected")),
    ]);

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock detected");
  });

  it("reports success with a warning when the read-back fails", async () => {
    const { client } = await connectWithFake([
      stateRoute({ finished_at: null, workout_id: WORKOUT_ID }),
      finishRpc(),
      detailRoute(failure("connection reset")),
    ]);

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      alreadyFinished: false,
      rotated: true,
      sessionId: SESSION_ID,
    });
    expect(result.json.warning).toContain("get_workout_session");
  });
});

describe("delete_workout_session", () => {
  it("deletes the session", async () => {
    const { client } = await connectWithFake([
      {
        filters: [["eq", "id", SESSION_ID]],
        name: "workout_sessions",
        operation: "delete",
        response: ok([{ id: SESSION_ID }]),
      },
    ]);
    const result = await call(client, "delete_workout_session", {
      sessionId: SESSION_ID,
    });
    expect(result.json).toEqual({ deleted: true, sessionId: SESSION_ID });
  });

  it("errors when nothing was deleted", async () => {
    const { client } = await connectWithFake([
      { name: "workout_sessions", operation: "delete", response: ok([]) },
    ]);
    const result = await call(client, "delete_workout_session", {
      sessionId: SESSION_ID,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain(`Workout session ${SESSION_ID} not found`);
  });
});
