import type {
  WorkoutSessionDetail,
  WorkoutSessionSummary,
} from "@fitme/services/workout-sessions";
import { describe, expect, it } from "vitest";
import type { UserServices, WithWeightUnit } from "../services.js";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const SESSION_ID = "6f1c0c9e-2b7a-4c1e-9a55-3c2d1e0f4a11";
const WORKOUT_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const LEGACY_EXERCISE_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const summary: WorkoutSessionSummary = {
  exercise_count: 2,
  finished_at: null,
  id: SESSION_ID,
  logged_set_count: 1,
  plan: { id: "0b9e1a52-7c1d-4f3e-8a2b-5d6c7e8f9a01", name: "Strength" },
  set_count: 5,
  started_at: "2026-10-01T10:00:00.123456+00:00",
  status: "in_progress",
  workout: { id: WORKOUT_ID, name: "Push" },
};

const finishedSummary: WorkoutSessionSummary = {
  ...summary,
  finished_at: "2026-09-30T11:00:00+00:00",
  id: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
  plan: null,
  started_at: "2026-09-30T10:00:00+00:00",
  status: "finished",
  workout: null,
};

type ListOptions = Parameters<UserServices["listWorkoutSessions"]>[0];

/** A facade whose list answers `page` and records the options it got. */
const listing = (
  page: Awaited<ReturnType<UserServices["listWorkoutSessions"]>>
) => {
  const calls: ListOptions[] = [];
  const services = fakeServices({
    listWorkoutSessions: (options) => {
      calls.push(options);
      return Promise.resolve(page);
    },
  });
  return { calls, services };
};

const get = (app: ReturnType<typeof testApp>["app"], path: string) =>
  app.request(path, { headers: signedInAs("user_alice") });

describe("GET /v1/workout-sessions", () => {
  it("answers a page of the User's Workout Sessions with their counts", async () => {
    const { calls, services } = listing({
      sessions: [summary, finishedSummary],
      total: 2,
    });
    const { app, servicesFor } = testApp({ services });

    const response = await get(app, "/v1/workout-sessions");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [summary, finishedSummary],
      hasMore: false,
      total: 2,
    });
    expect(calls).toEqual([{ limit: 20, offset: 0, status: "all" }]);
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("passes status, limit and offset through, and says when more follow", async () => {
    const { calls, services } = listing({ sessions: [summary], total: 3 });
    const { app } = testApp({ services });

    const response = await get(
      app,
      "/v1/workout-sessions?status=in_progress&limit=1&offset=1"
    );

    expect(await response.json()).toEqual({
      data: [summary],
      hasMore: true,
      total: 3,
    });
    expect(calls).toEqual([{ limit: 1, offset: 1, status: "in_progress" }]);
  });

  it("answers an empty page with the total past the end", async () => {
    const { services } = listing({ sessions: [], total: 3 });
    const { app } = testApp({ services });

    const response = await get(app, "/v1/workout-sessions?offset=10");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      hasMore: false,
      total: 3,
    });
  });

  it.each([
    ["limit=0", "limit"],
    ["limit=51", "limit"],
    ["limit=1.5", "limit"],
    ["limit=ten", "limit"],
    ["offset=-1", "offset"],
    ["status=open", "status"],
  ])("answers 400 invalid_request for %s, unreported", async (query, field) => {
    const { app, reported } = testApp();

    const response = await get(app, `/v1/workout-sessions?${query}`);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain(`${field}:`);
    expect(reported).toEqual([]);
  });

  it("never shows fields beyond the contract", async () => {
    const { services } = listing({
      sessions: [
        {
          ...summary,
          plan: { ...summary.plan, deleted_at: null },
          user_id: "user_alice",
          workout: { id: WORKOUT_ID, name: "Push", order: 1 },
        } as WorkoutSessionSummary,
      ],
      total: 1,
    });
    const { app } = testApp({ services });

    const response = await get(app, "/v1/workout-sessions");

    expect(await response.json()).toEqual({
      data: [summary],
      hasMore: false,
      total: 1,
    });
  });

  it("answers 401 without a token", async () => {
    const { app } = testApp();

    const response = await app.request("/v1/workout-sessions");

    expect(response.status).toBe(401);
  });
});

const set = {
  id: "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b",
  logged_at: "2026-10-01T10:05:00+00:00",
  order: 1,
  reps_completed: 8,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_completed: 80.5,
  weight_recommended: 80,
};

const unloggedSet = {
  id: "4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c",
  logged_at: null,
  order: 2,
  reps_completed: null,
  reps_recommended: 8,
  rest_recommended: null,
  weight_completed: null,
  weight_recommended: null,
};

const exercise = {
  exercise_slug: "barbell-bench-press",
  id: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
  order: 1,
  sets: [set, unloggedSet],
};

const sessionFields = {
  finished_at: null,
  id: SESSION_ID,
  plan: summary.plan,
  started_at: summary.started_at,
  status: "in_progress",
  workout: summary.workout,
} as const;

/** The Workout Session as the facade answers it: with the legacy joined Exercise. */
const fromServices: WithWeightUnit<WorkoutSessionDetail> = {
  ...sessionFields,
  exercises: [
    {
      ...exercise,
      exercise: { id: LEGACY_EXERCISE_ID, name: "Bench press" },
    },
  ],
  weight_unit: "lbs",
};

/** The same Workout Session as the API answers it. */
const shown = { ...sessionFields, exercises: [exercise], weight_unit: "lbs" };

describe("GET /v1/workout-sessions/:id", () => {
  it("answers the Workout Session in full with its weight unit, Exercises by slug only", async () => {
    const asked: string[] = [];
    const { app, servicesFor } = testApp({
      services: fakeServices({
        getWorkoutSession: (id) => {
          asked.push(id);
          return Promise.resolve(fromServices);
        },
      }),
    });

    const response = await get(app, `/v1/workout-sessions/${SESSION_ID}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: shown });
    expect(asked).toEqual([SESSION_ID]);
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("answers 404 not_found when the User has no such Workout Session, unreported", async () => {
    const { app, reported } = testApp({
      services: fakeServices({
        getWorkoutSession: () => Promise.resolve(null),
      }),
    });

    const response = await get(app, `/v1/workout-sessions/${SESSION_ID}`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Workout Session not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for an id that isn't a uuid, unreported", async () => {
    const { app, reported } = testApp();

    const response = await get(app, "/v1/workout-sessions/not-a-uuid");

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });

  it("never shows legacy or internal fields", async () => {
    const [legacyExercise] = fromServices.exercises;
    const withInternals = {
      ...fromServices,
      exercises: [
        {
          ...legacyExercise,
          exercise_id: LEGACY_EXERCISE_ID,
          sets: [{ ...set, workout_session_exercise_id: exercise.id }],
        },
      ],
      user_id: "user_alice",
      workout_id: WORKOUT_ID,
    };
    const { app } = testApp({
      services: fakeServices({
        getWorkoutSession: () => Promise.resolve(withInternals),
      }),
    });

    const response = await get(app, `/v1/workout-sessions/${SESSION_ID}`);

    expect(await response.json()).toEqual({
      data: { ...shown, exercises: [{ ...exercise, sets: [set] }] },
    });
  });
});
