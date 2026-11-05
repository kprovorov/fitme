import { memoryRateLimiter } from "@fitme/rate-limit";
import type {
  ExerciseHistoryEntry,
  ExerciseHistoryQuery,
} from "@fitme/services/exercises";
import { describe, expect, it } from "vitest";

import type { UserServices, Weighed } from "../services.js";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const SESSION_ID = "6f1c0c9e-2b7a-4c1e-9a55-3c2d1e0f4a11";
const SESSION_EXERCISE_ID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SET_ID = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b";
const BODYWEIGHT_SET_ID = "4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c";

const SLUG = "barbell-back-squat";

/** An entry as the service answers it: with its Plan and Workout, which the route drops. */
const entry: ExerciseHistoryEntry = {
  finished_at: "2026-10-01T11:00:00+00:00",
  plan: { id: "0b9e1a52-7c1d-4f3e-8a2b-5d6c7e8f9a01", name: "Strength" },
  session_exercise_id: SESSION_EXERCISE_ID,
  session_id: SESSION_ID,
  sets: [
    {
      id: SET_ID,
      logged_at: "2026-10-01T10:05:00+00:00",
      order: 1,
      reps_completed: 8,
      reps_recommended: 8,
      weight_completed: 80.5,
      weight_recommended: 80,
    },
    {
      // a bodyweight set: logged reps, no weight
      id: BODYWEIGHT_SET_ID,
      logged_at: "2026-10-01T10:10:00+00:00",
      order: 2,
      reps_completed: 12,
      reps_recommended: null,
      weight_completed: null,
      weight_recommended: null,
    },
  ],
  started_at: "2026-10-01T10:00:00+00:00",
  workout: { id: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a", name: "Legs" },
};

/** The same entry as the route answers it: no Plan, no Workout, no `logged_at`. */
const answered = {
  id: SESSION_EXERCISE_ID,
  session: {
    finished_at: "2026-10-01T11:00:00+00:00",
    id: SESSION_ID,
    started_at: "2026-10-01T10:00:00+00:00",
  },
  sets: [
    {
      id: SET_ID,
      order: 1,
      reps_completed: 8,
      reps_recommended: 8,
      weight_completed: 80.5,
      weight_recommended: 80,
    },
    {
      id: BODYWEIGHT_SET_ID,
      order: 2,
      reps_completed: 12,
      reps_recommended: null,
      weight_completed: null,
      weight_recommended: null,
    },
  ],
};

type Page = Awaited<ReturnType<UserServices["getExerciseHistory"]>>["value"];

/**
 * A facade whose Exercise history answers `page` in `weightUnit` and records
 * the queries it got.
 */
const listing = (
  page: Page,
  weightUnit: Weighed<Page>["weightUnit"] = "kg"
) => {
  const calls: ExerciseHistoryQuery[] = [];

  const services = fakeServices({
    getExerciseHistory: (query) => {
      calls.push(query);

      return Promise.resolve({ value: page, weightUnit });
    },
  });

  return { calls, services };
};

const get = (app: ReturnType<typeof testApp>["app"], query: string) =>
  app.request(`/v1/workout-session-exercises?${query}`, {
    headers: signedInAs("user_alice"),
  });

describe("gET /v1/workout-session-exercises", () => {
  it("answers a page of the User's entries for the Exercise, with its bodyweight set", async () => {
    const { calls, services } = listing({ entries: [entry], total: 1 });
    const { app, servicesFor } = testApp({ services });

    const response = await get(app, `exercise_slug=${SLUG}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [answered],
      hasMore: false,
      total: 1,
      weight_unit: "kg",
    });
    expect(calls).toEqual([{ exerciseSlug: SLUG, limit: 20, offset: 0 }]);
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("passes limit and offset through, and says when more follow", async () => {
    const { calls, services } = listing({ entries: [entry], total: 5 });
    const { app } = testApp({ services });

    const response = await get(app, `exercise_slug=${SLUG}&limit=1&offset=1`);

    await expect(response.json()).resolves.toMatchObject({
      hasMore: true,
      total: 5,
    });
    expect(calls).toEqual([{ exerciseSlug: SLUG, limit: 1, offset: 1 }]);
  });

  it("answers an empty page past the end, with the total", async () => {
    const { services } = listing({ entries: [], total: 3 });
    const { app } = testApp({ services });

    const response = await get(app, `exercise_slug=${SLUG}&offset=10`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      hasMore: false,
      total: 3,
      weight_unit: "kg",
    });
  });

  it("answers an empty page for an Exercise the User never did", async () => {
    const { services } = listing({ entries: [], total: 0 });
    const { app, reported } = testApp({ services });

    const response = await get(app, "exercise_slug=never-done-this");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      hasMore: false,
      total: 0,
      weight_unit: "kg",
    });
    expect(reported).toEqual([]);
  });

  it("answers the weights in the User's weight unit", async () => {
    const { services } = listing({ entries: [entry], total: 1 }, "lbs");
    const { app } = testApp({ services });

    const response = await get(app, `exercise_slug=${SLUG}`);

    await expect(response.json()).resolves.toMatchObject({
      weight_unit: "lbs",
    });
  });

  it("never shows fields beyond the contract", async () => {
    const { services } = listing({
      entries: [
        {
          ...entry,
          sets: [{ ...entry.sets[0], rest_recommended: 90 }],
          user_id: "user_alice",
        } as unknown as ExerciseHistoryEntry,
      ],
      total: 1,
    });

    const { app } = testApp({ services });

    const response = await get(app, `exercise_slug=${SLUG}`);

    await expect(response.json()).resolves.toEqual({
      data: [{ ...answered, sets: [answered.sets[0]] }],
      hasMore: false,
      total: 1,
      weight_unit: "kg",
    });
  });

  it.each([
    ["", "exercise_slug"],
    ["exercise_slug=", "exercise_slug"],
    ["exercise_slug=Barbell_Squat", "exercise_slug"],
    [`exercise_slug=${SLUG}&limit=0`, "limit"],
    [`exercise_slug=${SLUG}&limit=51`, "limit"],
    [`exercise_slug=${SLUG}&limit=1.5`, "limit"],
    [`exercise_slug=${SLUG}&limit=ten`, "limit"],
    [`exercise_slug=${SLUG}&offset=-1`, "offset"],
  ])("answers 400 invalid_request for %s, unreported", async (query, field) => {
    const { app, reported } = testApp();

    const response = await get(app, query);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain(`${field}:`);
    expect(reported).toEqual([]);
  });

  it("answers 401 without a token", async () => {
    const { app } = testApp();

    const response = await app.request(
      `/v1/workout-session-exercises?exercise_slug=${SLUG}`
    );

    expect(response.status).toBe(401);
  });

  it("answers 429 with Retry-After once the User is over their limit", async () => {
    const { services } = listing({ entries: [], total: 0 });

    const { app, reported } = testApp({
      rateLimiter: memoryRateLimiter({ limit: 1, windowMs: 60_000 }),
      services,
    });

    const first = await get(app, `exercise_slug=${SLUG}`);
    const second = await get(app, `exercise_slug=${SLUG}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect((await second.json()).error.code).toBe("rate_limited");
    expect(Number(second.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(reported).toEqual([]);
  });
});
