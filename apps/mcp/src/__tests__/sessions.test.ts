import { afterEach, describe, expect, it } from "vitest";
import { type Filter, failure, ok, type Route } from "./fake-supabase.js";
import {
  call,
  callsTo,
  connectWithFake,
  expectAllCallsRouted,
  SESSION_ID,
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
