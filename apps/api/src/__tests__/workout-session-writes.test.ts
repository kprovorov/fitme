import {
  MAX_EXERCISE_SLUG_LENGTH,
  MAX_REPS,
  MAX_WEIGHT,
} from "@fitme/core/limits";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import type {
  WorkoutSessionDetail,
  WorkoutSessionSet,
} from "@fitme/services/workout-sessions";
import { describe, expect, it } from "vitest";
import type { UserServices } from "../services.js";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const SESSION_ID = "6f1c0c9e-2b7a-4c1e-9a55-3c2d1e0f4a11";
const WORKOUT_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SET_ID = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b";

const set: WorkoutSessionSet = {
  id: SET_ID,
  logged_at: null,
  order: 1,
  reps_completed: null,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_completed: null,
  weight_recommended: 80,
};

const exercise = {
  exercise_slug: "barbell-bench-press",
  id: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
  order: 1,
  sets: [set],
};

const sessionFields = {
  finished_at: null,
  id: SESSION_ID,
  plan: { id: "0b9e1a52-7c1d-4f3e-8a2b-5d6c7e8f9a01", name: "Strength" },
  started_at: "2026-10-01T10:00:00.123456+00:00",
  status: "in_progress",
  workout: { id: WORKOUT_ID, name: "Push" },
} as const;

/** The Workout Session as the services answer it: with their internals. */
const session = {
  ...sessionFields,
  exercises: [exercise],
  user_id: "user_alice",
} as unknown as WorkoutSessionDetail;

/** The same Workout Session as the API answers it. */
const shown = { ...sessionFields, exercises: [exercise], weight_unit: "lbs" };

const finishedSession: WorkoutSessionDetail = {
  ...session,
  finished_at: "2026-10-01T11:00:00+00:00",
  status: "finished",
};

const shownFinished = {
  ...shown,
  finished_at: "2026-10-01T11:00:00+00:00",
  status: "finished",
};

type App = ReturnType<typeof testApp>["app"];

const send = (
  app: App,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) =>
  app.request(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...signedInAs("user_alice"),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    method,
  });

/** A facade whose `method` answers `result` and records what it was called with. */
const recording = <M extends keyof UserServices>(
  method: M,
  result: Awaited<ReturnType<UserServices[M]>>
) => {
  const calls: unknown[] = [];
  const services = fakeServices({
    [method]: (arg: unknown) => {
      calls.push(arg);
      return Promise.resolve(result);
    },
  });
  return { calls, services };
};

describe("POST /v1/workout-sessions", () => {
  it("answers 201 with the new Workout Session in full", async () => {
    const { calls, services } = recording("startWorkoutSession", {
      value: { resumed: false, session, status: "started" },
      weightUnit: "lbs",
    });
    const { app, servicesFor } = testApp({ services });

    const response = await send(app, "POST", "/v1/workout-sessions", {
      workout_id: WORKOUT_ID,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: shown });
    expect(calls).toEqual([WORKOUT_ID]);
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("answers 200 with the same body when it resumes the open Workout Session", async () => {
    const { services } = recording("startWorkoutSession", {
      value: { resumed: true, session, status: "started" },
      weightUnit: "lbs",
    });
    const { app } = testApp({ services });

    const response = await send(app, "POST", "/v1/workout-sessions", {
      workout_id: WORKOUT_ID,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: shown });
  });

  it("answers kg for a User without a Profile", async () => {
    const { services } = recording("startWorkoutSession", {
      value: { resumed: false, session, status: "started" },
      weightUnit: "kg",
    });
    const { app } = testApp({ services });

    const response = await send(app, "POST", "/v1/workout-sessions", {
      workout_id: WORKOUT_ID,
    });

    expect((await response.json()).data.weight_unit).toBe("kg");
  });

  it("answers 404 not_found for a Workout that's missing, another User's or of a deleted Plan, unreported", async () => {
    const { services } = recording("startWorkoutSession", {
      value: { status: "not_found" },
      weightUnit: "kg",
    });
    const { app, reported } = testApp({ services });

    const response = await send(app, "POST", "/v1/workout-sessions", {
      workout_id: WORKOUT_ID,
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Workout not found" },
    });
    expect(reported).toEqual([]);
  });

  it.each([
    ["a malformed workout_id", { workout_id: "not-a-uuid" }, "workout_id:"],
    ["no workout_id", {}, "workout_id:"],
    ["an unknown field", { user_id: "user_bob", workout_id: WORKOUT_ID }, ""],
  ])(
    "answers 400 invalid_request for %s, unreported",
    async (_, body, field) => {
      const { app, reported } = testApp();

      const response = await send(app, "POST", "/v1/workout-sessions", body);

      expect(response.status).toBe(400);
      const { error } = await response.json();
      expect(error.code).toBe("invalid_request");
      expect(error.message).toContain(field);
      expect(reported).toEqual([]);
    }
  );

  it("answers 401 without a token", async () => {
    const { app } = testApp();

    const response = await app.request("/v1/workout-sessions", {
      body: JSON.stringify({ workout_id: WORKOUT_ID }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(401);
  });
});

describe("POST /v1/workout-sessions/:id/finish", () => {
  it("answers the finished Workout Session with already_finished: false", async () => {
    const { calls, services } = recording("finishWorkoutSession", {
      value: {
        alreadyFinished: false,
        rotated: true,
        session: finishedSession,
        status: "finished",
      },
      weightUnit: "lbs",
    });
    const { app } = testApp({ services });

    const response = await send(
      app,
      "POST",
      `/v1/workout-sessions/${SESSION_ID}/finish`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      already_finished: false,
      data: shownFinished,
    });
    expect(calls).toEqual([SESSION_ID]);
  });

  it("answers already_finished: true on a repeat", async () => {
    const { services } = recording("finishWorkoutSession", {
      value: {
        alreadyFinished: true,
        rotated: false,
        session: finishedSession,
        status: "finished",
      },
      weightUnit: "lbs",
    });
    const { app } = testApp({ services });

    const response = await send(
      app,
      "POST",
      `/v1/workout-sessions/${SESSION_ID}/finish`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      already_finished: true,
      data: shownFinished,
    });
  });

  it("answers 404 not_found when the User has no such Workout Session, unreported", async () => {
    const { services } = recording("finishWorkoutSession", {
      value: { status: "not_found" },
      weightUnit: "kg",
    });
    const { app, reported } = testApp({ services });

    const response = await send(
      app,
      "POST",
      `/v1/workout-sessions/${SESSION_ID}/finish`
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Workout Session not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for an id that isn't a uuid, unreported", async () => {
    const { app, reported } = testApp();

    const response = await send(
      app,
      "POST",
      "/v1/workout-sessions/not-a-uuid/finish"
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });
});

describe("DELETE /v1/workout-sessions/:id", () => {
  it("answers 204 with no body when it deletes the Workout Session", async () => {
    const { calls, services } = recording("deleteWorkoutSession", true);
    const { app } = testApp({ services });

    const response = await send(
      app,
      "DELETE",
      `/v1/workout-sessions/${SESSION_ID}`
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(calls).toEqual([SESSION_ID]);
  });

  it("answers 204 too when nothing of the User's matched (a repeat, or another User's id), unreported", async () => {
    const { services } = recording("deleteWorkoutSession", false);
    const { app, reported } = testApp({ services });

    const response = await send(
      app,
      "DELETE",
      `/v1/workout-sessions/${SESSION_ID}`
    );

    expect(response.status).toBe(204);
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for an id that isn't a uuid, unreported", async () => {
    const { app, reported } = testApp();

    const response = await send(app, "DELETE", "/v1/workout-sessions/nope");

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });
});

describe("PATCH /v1/workout-session-sets/:id", () => {
  const logged: WorkoutSessionSet = {
    ...set,
    logged_at: "2026-10-01T10:05:00+00:00",
    reps_completed: 8,
    weight_completed: 82.5,
  };

  it("logs the set and answers it with its weight unit", async () => {
    const { calls, services } = recording("logSet", {
      value: {
        set: { ...logged, workout_session_exercise_id: exercise.id },
        status: "logged",
      } as Awaited<ReturnType<UserServices["logSet"]>>["value"],
      weightUnit: "lbs",
    });
    const { app, servicesFor } = testApp({ services });

    const response = await send(
      app,
      "PATCH",
      `/v1/workout-session-sets/${SET_ID}`,
      { reps_completed: 8, weight_completed: 82.5 }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { ...logged, weight_unit: "lbs" },
    });
    expect(calls).toEqual([
      { repsCompleted: 8, setId: SET_ID, weightCompleted: 82.5 },
    ]);
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it.each([
    ["0 reps and 0 weight (bodyweight)", 0, 0],
    ["the limits themselves", MAX_REPS, MAX_WEIGHT],
  ])("accepts %s", async (_, reps, weight) => {
    const { calls, services } = recording("logSet", {
      value: { set: logged, status: "logged" },
      weightUnit: "kg",
    });
    const { app } = testApp({ services });

    const response = await send(
      app,
      "PATCH",
      `/v1/workout-session-sets/${SET_ID}`,
      { reps_completed: reps, weight_completed: weight }
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      { repsCompleted: reps, setId: SET_ID, weightCompleted: weight },
    ]);
  });

  it("answers 409 session_finished for a set of a finished Workout Session, unreported", async () => {
    const { services } = recording("logSet", {
      value: {
        finishedAt: "2026-10-01T11:00:00+00:00",
        sessionId: SESSION_ID,
        status: "session_finished",
      },
      weightUnit: "kg",
    });
    const { app, reported } = testApp({ services });

    const response = await send(
      app,
      "PATCH",
      `/v1/workout-session-sets/${SET_ID}`,
      { reps_completed: 8, weight_completed: 80 }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("session_finished");
    expect(reported).toEqual([]);
  });

  it("answers 404 not_found for a set the User doesn't have, unreported", async () => {
    const { services } = recording("logSet", {
      value: { status: "not_found" },
      weightUnit: "kg",
    });
    const { app, reported } = testApp({ services });

    const response = await send(
      app,
      "PATCH",
      `/v1/workout-session-sets/${SET_ID}`,
      { reps_completed: 8, weight_completed: 80 }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Workout Session set not found" },
    });
    expect(reported).toEqual([]);
  });

  it.each([
    ["negative reps", { reps_completed: -1, weight_completed: 80 }],
    ["fractional reps", { reps_completed: 1.5, weight_completed: 80 }],
    [
      "reps over the limit",
      { reps_completed: MAX_REPS + 1, weight_completed: 80 },
    ],
    ["negative weight", { reps_completed: 8, weight_completed: -1 }],
    [
      "weight over the limit",
      { reps_completed: 8, weight_completed: MAX_WEIGHT + 1 },
    ],
    ["weight with 3 decimals", { reps_completed: 8, weight_completed: 80.125 }],
    ["no weight", { reps_completed: 8 }],
    [
      "an unknown field",
      { reps_completed: 8, set_id: SET_ID, weight_completed: 80 },
    ],
  ])("answers 400 invalid_request for %s, unreported", async (_, body) => {
    const { app, reported } = testApp();

    const response = await send(
      app,
      "PATCH",
      `/v1/workout-session-sets/${SET_ID}`,
      body
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for a set id that isn't a uuid, unreported", async () => {
    const { app, reported } = testApp();

    const response = await send(app, "PATCH", "/v1/workout-session-sets/nope", {
      reps_completed: 8,
      weight_completed: 80,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });

  it("answers 415 for a body that isn't JSON, unreported", async () => {
    const { app, reported } = testApp();

    const response = await send(
      app,
      "PATCH",
      `/v1/workout-session-sets/${SET_ID}`,
      undefined,
      { "content-type": "text/plain" }
    );

    expect(response.status).toBe(415);
    expect(reported).toEqual([]);
  });
});

describe("POST /v1/workout-sessions/:id/exercises", () => {
  const path = `/v1/workout-sessions/${SESSION_ID}/exercises`;
  const added = {
    exercise_slug: "barbell-back-squat",
    id: "4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c",
    order: 4,
    sets: [],
  };

  it("appends the Exercise and answers 201 with it, its sets and the weight unit", async () => {
    const { calls, services } = recording("addExerciseToWorkoutSession", {
      value: {
        exercise: { ...added, workout_session_id: SESSION_ID },
        status: "added",
      } as Awaited<
        ReturnType<UserServices["addExerciseToWorkoutSession"]>
      >["value"],
      weightUnit: "lbs",
    });
    const { app, servicesFor } = testApp({ services });

    const response = await send(app, "POST", path, {
      exercise_slug: "barbell-back-squat",
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: { ...added, weight_unit: "lbs" },
    });
    expect(calls).toEqual([
      { exerciseSlug: "barbell-back-squat", sessionId: SESSION_ID },
    ]);
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("answers 404 not_found for a Workout Session the User doesn't have, unreported", async () => {
    const { services } = recording("addExerciseToWorkoutSession", {
      value: { status: "not_found" },
      weightUnit: "kg",
    });
    const { app, reported } = testApp({ services });

    const response = await send(app, "POST", path, {
      exercise_slug: "barbell-back-squat",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Workout Session not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 409 session_finished for a finished Workout Session, unreported", async () => {
    const { services } = recording("addExerciseToWorkoutSession", {
      value: {
        finishedAt: "2026-10-01T11:00:00+00:00",
        status: "session_finished",
      },
      weightUnit: "kg",
    });
    const { app, reported } = testApp({ services });

    const response = await send(app, "POST", path, {
      exercise_slug: "barbell-back-squat",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "session_finished",
        message: `Workout Session ${SESSION_ID} was finished at 2026-10-01T11:00:00+00:00; it can no longer be changed`,
      },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 unknown_exercises naming the slug, before any service call, unreported", async () => {
    // addExerciseToWorkoutSession isn't faked: calling it would fail the request with a 500
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await send(app, "POST", path, {
      exercise_slug: "made-up-press",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "unknown_exercises",
        message: "Unknown exercise_slug(s): made-up-press",
      },
    });
    expect(reported).toEqual([]);
  });

  it("answers a reported 503 exercise_library_unavailable when the Library fails, before any service call", async () => {
    const { app, library, reported } = testApp({ services: fakeServices({}) });
    const outage = new LibraryUnavailableError();
    library.failWith(outage);

    const response = await send(app, "POST", path, {
      exercise_slug: "barbell-back-squat",
    });

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "exercise_library_unavailable"
    );
    expect(reported).toEqual([outage]);
  });

  it("answers a reported 503 exercise_library_unavailable when the Library isn't configured", async () => {
    const { app, reported } = testApp({
      library: null,
      services: fakeServices({}),
    });

    const response = await send(app, "POST", path, {
      exercise_slug: "barbell-back-squat",
    });

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "exercise_library_unavailable"
    );
    expect(reported).toHaveLength(1);
  });

  it.each([
    ["no slug", {}],
    ["a slug that isn't one", { exercise_slug: "Bench Press" }],
    [
      "a slug over the length limit",
      { exercise_slug: "a".repeat(MAX_EXERCISE_SLUG_LENGTH + 1) },
    ],
    ["an unknown field", { exercise_slug: "barbell-back-squat", order: 1 }],
  ])("answers 400 invalid_request for %s, unreported", async (_, body) => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await send(app, "POST", path, body);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for a Workout Session id that isn't a uuid, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await send(
      app,
      "POST",
      "/v1/workout-sessions/nope/exercises",
      {
        exercise_slug: "barbell-back-squat",
      }
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });

  it("answers 415 for a body that isn't JSON, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await send(app, "POST", path, undefined, {
      "content-type": "text/plain",
    });

    expect(response.status).toBe(415);
    expect(reported).toEqual([]);
  });
});
