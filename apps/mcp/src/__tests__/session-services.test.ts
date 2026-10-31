import { LibraryUnavailableError } from "@fitme/library-sdk";
import type {
  WorkoutSessionDetail,
  WorkoutSessionSet,
} from "@fitme/services/workout-sessions";
import { describe, expect, it, vi } from "vitest";
import {
  BENCH,
  call,
  connectWithServices,
  fakeLibrary,
  recordingReporter,
  SESSION_ID,
  SET_ID,
  WORKOUT_ID,
} from "./harness.js";

const FINISHED_AT = "2026-10-01T11:00:00.123+00:00";

const loggedSet: WorkoutSessionSet = {
  id: SET_ID,
  logged_at: "2026-10-01T10:30:00.5+00:00",
  order: 1,
  reps_completed: 8,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_completed: 62.5,
  weight_recommended: 60,
};

const sessionDetail: WorkoutSessionDetail = {
  exercises: [
    {
      exercise_slug: BENCH.slug,
      id: "wse-1",
      order: 1,
      sets: [loggedSet],
    },
    {
      exercise_slug: "cable-fly-legacy",
      id: "wse-2",
      order: 2,
      sets: [],
    },
  ],
  finished_at: FINISHED_AT,
  id: SESSION_ID,
  plan: { id: "plan", name: null },
  started_at: "2026-10-01T10:00:00+00:00",
  status: "finished",
  workout: null,
};

/** The session as the tools return it: Exercises by slug, named by the library or from the slug. */
const toolSession = {
  ...sessionDetail,
  exercises: [
    {
      exercise_slug: BENCH.slug,
      id: "wse-1",
      muscle_groups: BENCH.muscle_groups,
      name: BENCH.name,
      order: 1,
      sets: [loggedSet],
    },
    {
      exercise_slug: "cable-fly-legacy",
      id: "wse-2",
      muscle_groups: [],
      name: "Cable fly legacy",
      order: 2,
      sets: [],
    },
  ],
};

describe("get_workout_session", () => {
  it("returns the session the service found, its Exercises named", async () => {
    const getWorkoutSession = vi.fn(() => Promise.resolve(sessionDetail));
    const client = await connectWithServices({ getWorkoutSession });

    const result = await call(client, "get_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(toolSession);
    expect(getWorkoutSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it("still answers, with slug-derived names, when the library fails, and reports it", async () => {
    const library = fakeLibrary();
    library.failWith(new LibraryUnavailableError());
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices(
      { getWorkoutSession: () => Promise.resolve(sessionDetail) },
      reportError,
      library
    );

    const result = await call(client, "get_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      exercises: [
        { muscle_groups: [], name: "Bench press" },
        { name: "Cable fly legacy" },
      ],
    });
    expect(reported).toHaveLength(1);
  });

  it("errors for an unknown session", async () => {
    const client = await connectWithServices({
      getWorkoutSession: () => Promise.resolve(null),
    });

    const result = await call(client, "get_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Workout session ${SESSION_ID} not found (it may have been deleted or belong to another user).`
    );
  });

  it("rejects a session id that isn't a uuid", async () => {
    const getWorkoutSession = vi.fn();
    const client = await connectWithServices({ getWorkoutSession });

    const result = await call(client, "get_workout_session", {
      sessionId: "nope",
    });

    expect(result.isError).toBe(true);
    expect(getWorkoutSession).not.toHaveBeenCalled();
  });
});

describe("list_workout_sessions", () => {
  const summary = {
    completed_rep_count: 16,
    exercise_count: 2,
    finished_at: null,
    id: SESSION_ID,
    logged_set_count: 2,
    personal_records: [],
    plan: null,
    set_count: 3,
    started_at: "2026-10-01T10:00:00+00:00",
    status: "in_progress" as const,
    volume: 1280,
    workout: null,
  };

  it("passes the defaults and returns the page with hasMore", async () => {
    const listWorkoutSessions = vi.fn(() =>
      Promise.resolve({ sessions: [summary], total: 21 })
    );
    const client = await connectWithServices({ listWorkoutSessions });

    const result = await call(client, "list_workout_sessions");

    expect(listWorkoutSessions).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      status: "all",
    });
    expect(result.json).toEqual({
      hasMore: true,
      limit: 20,
      offset: 0,
      sessions: [summary],
      total: 21,
    });
  });

  it("passes the status filter and reports the last page", async () => {
    const listWorkoutSessions = vi.fn(() =>
      Promise.resolve({ sessions: [summary], total: 6 })
    );
    const client = await connectWithServices({ listWorkoutSessions });

    const result = await call(client, "list_workout_sessions", {
      limit: 5,
      offset: 5,
      status: "in_progress",
    });

    expect(listWorkoutSessions).toHaveBeenCalledWith({
      limit: 5,
      offset: 5,
      status: "in_progress",
    });
    expect(result.json).toMatchObject({ hasMore: false, total: 6 });
  });

  it("returns an empty page for an offset past the end", async () => {
    const client = await connectWithServices({
      listWorkoutSessions: () => Promise.resolve({ sessions: [], total: 3 }),
    });

    const result = await call(client, "list_workout_sessions", {
      offset: 20,
      status: "finished",
    });

    expect(result.json).toEqual({
      hasMore: false,
      limit: 20,
      offset: 20,
      sessions: [],
      total: 3,
    });
  });

  it("rejects a page size over the maximum", async () => {
    const listWorkoutSessions = vi.fn();
    const client = await connectWithServices({ listWorkoutSessions });

    const result = await call(client, "list_workout_sessions", {
      limit: 101,
    });

    expect(result.isError).toBe(true);
    expect(listWorkoutSessions).not.toHaveBeenCalled();
  });
});

describe("log_set", () => {
  const args = { repsCompleted: 8, setId: SET_ID, weightCompleted: 62.5 };

  it("logs the set and returns it, weight unconverted", async () => {
    const logSet = vi.fn(() =>
      Promise.resolve({ set: loggedSet, status: "logged" as const })
    );
    const client = await connectWithServices({ logSet });

    const result = await call(client, "log_set", args);

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(loggedSet);
    expect(logSet).toHaveBeenCalledWith(args);
  });

  it("errors when no set matches (e.g. another user's set or a plan set id)", async () => {
    const client = await connectWithServices({
      logSet: () => Promise.resolve({ status: "not_found" as const }),
    });

    const result = await call(client, "log_set", args);

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Set ${SET_ID} not found. Use the set ids from get_workout_session (workout_session_exercise_sets.id).`
    );
  });

  it("refuses to log into a finished session", async () => {
    const client = await connectWithServices({
      logSet: () =>
        Promise.resolve({
          finishedAt: FINISHED_AT,
          sessionId: SESSION_ID,
          status: "session_finished" as const,
        }),
    });

    const result = await call(client, "log_set", args);

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Workout session ${SESSION_ID} was finished at ${FINISHED_AT}; its sets can no longer be logged.`
    );
  });

  it("rejects negative reps before calling the service", async () => {
    const logSet = vi.fn();
    const client = await connectWithServices({ logSet });

    const result = await call(client, "log_set", {
      ...args,
      repsCompleted: -1,
    });

    expect(result.isError).toBe(true);
    expect(logSet).not.toHaveBeenCalled();
  });

  it("reports a database failure as a tool error", async () => {
    const client = await connectWithServices({
      logSet: () =>
        Promise.reject(
          new Error("Failed query: update ...", {
            cause: Object.assign(new Error("deadlock detected"), {
              code: "40P01",
            }),
          })
        ),
    });

    const result = await call(client, "log_set", args);

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock detected");
  });
});

describe("delete_workout_session", () => {
  it("deletes the session", async () => {
    const deleteWorkoutSession = vi.fn(() => Promise.resolve(true));
    const client = await connectWithServices({ deleteWorkoutSession });

    const result = await call(client, "delete_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.json).toEqual({ deleted: true, sessionId: SESSION_ID });
    expect(deleteWorkoutSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it("errors when nothing was deleted", async () => {
    const client = await connectWithServices({
      deleteWorkoutSession: () => Promise.resolve(false),
    });

    const result = await call(client, "delete_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Workout session ${SESSION_ID} not found (it may have been deleted or belong to another user).`
    );
  });
});

const openSession: WorkoutSessionDetail = {
  ...sessionDetail,
  finished_at: null,
  status: "in_progress",
  workout: { id: WORKOUT_ID, name: "Day A" },
};

const toolOpenSession = {
  ...toolSession,
  finished_at: null,
  status: "in_progress",
  workout: { id: WORKOUT_ID, name: "Day A" },
};

describe("start_workout_session", () => {
  it("starts a session and returns it", async () => {
    const startWorkoutSession = vi.fn(() =>
      Promise.resolve({
        resumed: false,
        session: openSession,
        status: "started" as const,
      })
    );
    const client = await connectWithServices({ startWorkoutSession });

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual({ resumed: false, session: toolOpenSession });
    expect(startWorkoutSession).toHaveBeenCalledWith(WORKOUT_ID);
  });

  it("returns the open session it resumed", async () => {
    const client = await connectWithServices({
      startWorkoutSession: () =>
        Promise.resolve({
          resumed: true,
          session: openSession,
          status: "started" as const,
        }),
    });

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.json).toEqual({ resumed: true, session: toolOpenSession });
  });

  it("errors for a Workout it can't start (unknown, another user's or of a deleted plan)", async () => {
    const client = await connectWithServices({
      startWorkoutSession: () =>
        Promise.resolve({ status: "not_found" as const }),
    });

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Workout ${WORKOUT_ID} not found (its plan may have been deleted or belong to another user, or update_plan replaced it — get_plan returns the current workout ids).`
    );
  });

  it("refuses while another workout's session is open, naming it, unreported", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices(
      {
        startWorkoutSession: () =>
          Promise.resolve({
            sessionId: SESSION_ID,
            status: "session_in_progress" as const,
            workoutName: "Day A",
          }),
      },
      reportError
    );

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Workout "Day A" is already in progress (session ${SESSION_ID}): a user has at most one open workout session. Finish it with finish_workout_session (or delete_workout_session) before starting another.`
    );
    expect(reported).toEqual([]);
  });

  it("refuses while a session whose workout is gone is open", async () => {
    const client = await connectWithServices({
      startWorkoutSession: () =>
        Promise.resolve({
          sessionId: SESSION_ID,
          status: "session_in_progress" as const,
          workoutName: null,
        }),
    });

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Workout session ${SESSION_ID} is already in progress: a user has at most one open workout session. Finish it with finish_workout_session (or delete_workout_session) before starting another.`
    );
  });

  it("rejects a workout id that isn't a uuid", async () => {
    const startWorkoutSession = vi.fn();
    const client = await connectWithServices({ startWorkoutSession });

    const result = await call(client, "start_workout_session", {
      workoutId: "nope",
    });

    expect(result.isError).toBe(true);
    expect(startWorkoutSession).not.toHaveBeenCalled();
  });

  it("reports a database failure as a tool error", async () => {
    const client = await connectWithServices({
      startWorkoutSession: () =>
        Promise.reject(
          new Error("Failed query: ...", {
            cause: Object.assign(new Error("deadlock detected"), {
              code: "40P01",
            }),
          })
        ),
    });

    const result = await call(client, "start_workout_session", {
      workoutId: WORKOUT_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock detected");
  });
});

describe("finish_workout_session", () => {
  const finished = (alreadyFinished: boolean, rotated: boolean) => () =>
    Promise.resolve({
      alreadyFinished,
      rotated,
      session: sessionDetail,
      status: "finished" as const,
    });

  it("finishes the session and reports the rotation", async () => {
    const finishWorkoutSession = vi.fn(finished(false, true));
    const client = await connectWithServices({ finishWorkoutSession });

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      alreadyFinished: false,
      rotated: true,
      session: toolSession,
    });
    expect(finishWorkoutSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it("reports rotated: false when the session's workout is gone", async () => {
    const client = await connectWithServices({
      finishWorkoutSession: finished(false, false),
    });

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.json).toMatchObject({
      alreadyFinished: false,
      rotated: false,
    });
  });

  it("reports an already finished session", async () => {
    const client = await connectWithServices({
      finishWorkoutSession: finished(true, false),
    });

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.json).toMatchObject({
      alreadyFinished: true,
      rotated: false,
    });
  });

  it("errors for an unknown session", async () => {
    const client = await connectWithServices({
      finishWorkoutSession: () =>
        Promise.resolve({ status: "not_found" as const }),
    });

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      `Workout session ${SESSION_ID} not found (it may have been deleted or belong to another user).`
    );
  });

  it("rejects a session id that isn't a uuid", async () => {
    const finishWorkoutSession = vi.fn();
    const client = await connectWithServices({ finishWorkoutSession });

    const result = await call(client, "finish_workout_session", {
      sessionId: "nope",
    });

    expect(result.isError).toBe(true);
    expect(finishWorkoutSession).not.toHaveBeenCalled();
  });

  it("reports a database failure as a tool error", async () => {
    const client = await connectWithServices({
      finishWorkoutSession: () =>
        Promise.reject(
          new Error("Failed query: ...", {
            cause: Object.assign(new Error("deadlock detected"), {
              code: "40P01",
            }),
          })
        ),
    });

    const result = await call(client, "finish_workout_session", {
      sessionId: SESSION_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock detected");
  });
});
