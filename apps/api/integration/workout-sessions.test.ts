import { randomBytes } from "node:crypto";
import {
  plans,
  profiles,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * The Workout Session reads with the real services facade, through `asUser`
 * on the local stack's pooler, as made-up Clerk-style User ids with
 * test-signed session tokens.
 */
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  identifyUser: () => undefined,
  reportError: (error) => Promise.reject(error),
});

const runId = randomBytes(8).toString("hex");
const owner = `user_apiSessOwner${runId}`;
const intruder = `user_apiSessIntruder${runId}`;
const benchSlug = `test-api-sess-bench-${runId}`;
const squatSlug = `test-api-sess-squat-${runId}`;

/** A uuid nobody's Workout Session has. */
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

interface Seeded {
  finishedId: string;
  intruderId: string;
  openId: string;
  planId: string;
  workoutId: string;
}

let seeded: Seeded;

const seed = (): Promise<Seeded> =>
  withService(async (tx) => {
    // us: the owner's weights are in lbs; the intruder has no Profile.
    await tx.insert(profiles).values({
      age: 41,
      gender: "male",
      height: "70",
      measurementSystem: "us",
      userId: owner,
      weight: "180",
    });
    const [plan] = await tx
      .insert(plans)
      .values({
        frequency: 3,
        goal: "general",
        name: "Sessions plan",
        place: "gym",
        userId: owner,
      })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({ description: "A", name: "Day A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });
    const [finished, open, intruderSession] = await tx
      .insert(workoutSessions)
      .values([
        {
          finishedAt: "2026-10-01T11:00:00Z",
          planId: plan.id,
          startedAt: "2026-10-01T10:00:00Z",
          userId: owner,
          workoutId: workout.id,
        },
        {
          planId: plan.id,
          startedAt: "2026-10-02T10:00:00.123456Z",
          userId: owner,
          workoutId: workout.id,
        },
        { startedAt: "2026-10-03T10:00:00Z", userId: intruder },
      ])
      .returning({ id: workoutSessions.id });
    // Inserted out of order, so the read must sort by `order`.
    const [openSquat, openBench, finishedBench, intruderBench] = await tx
      .insert(workoutSessionExercises)
      .values([
        { exerciseSlug: squatSlug, order: 2, workoutSessionId: open.id },
        { exerciseSlug: benchSlug, order: 1, workoutSessionId: open.id },
        { exerciseSlug: benchSlug, order: 1, workoutSessionId: finished.id },
        {
          exerciseSlug: benchSlug,
          order: 1,
          workoutSessionId: intruderSession.id,
        },
      ])
      .returning({ id: workoutSessionExercises.id });
    await tx.insert(workoutSessionExerciseSets).values([
      {
        order: 1,
        repsRecommended: 5,
        restRecommended: 120,
        weightRecommended: "225.00",
        workoutSessionExerciseId: openSquat.id,
      },
      {
        order: 2,
        repsRecommended: 8,
        weightRecommended: "135.50",
        workoutSessionExerciseId: openBench.id,
      },
      {
        loggedAt: "2026-10-02T10:10:00Z",
        order: 1,
        repsCompleted: 8,
        repsRecommended: 8,
        restRecommended: 90,
        weightCompleted: "135.50",
        weightRecommended: "135.50",
        workoutSessionExerciseId: openBench.id,
      },
      {
        loggedAt: "2026-10-01T10:30:00Z",
        order: 1,
        repsCompleted: 8,
        repsRecommended: 8,
        weightCompleted: "130.00",
        weightRecommended: "130.00",
        workoutSessionExerciseId: finishedBench.id,
      },
      {
        order: 1,
        repsRecommended: 10,
        weightRecommended: "40.00",
        workoutSessionExerciseId: intruderBench.id,
      },
    ]);
    return {
      finishedId: finished.id,
      intruderId: intruderSession.id,
      openId: open.id,
      planId: plan.id,
      workoutId: workout.id,
    };
  });

/** The status and body of a GET as `userId`. */
const getAs = async (userId: string, path: string) => {
  const response = await app.request(path, { headers: signedInAs(userId) });
  return { body: await response.json(), status: response.status };
};

beforeAll(async () => {
  seeded = await seed();
});

afterAll(async () => {
  await deleteTestUsers([owner, intruder]);
});

describe("GET /v1/workout-sessions against the local stack", () => {
  const openSummary = () => ({
    exercise_count: 2,
    finished_at: null,
    id: seeded.openId,
    logged_set_count: 1,
    plan: { id: seeded.planId, name: "Sessions plan" },
    set_count: 3,
    started_at: "2026-10-02T10:00:00.123456+00:00",
    status: "in_progress",
    workout: { id: seeded.workoutId, name: "Day A" },
  });
  const finishedSummary = () => ({
    exercise_count: 1,
    finished_at: "2026-10-01T11:00:00+00:00",
    id: seeded.finishedId,
    logged_set_count: 1,
    plan: { id: seeded.planId, name: "Sessions plan" },
    set_count: 1,
    started_at: "2026-10-01T10:00:00+00:00",
    status: "finished",
    workout: { id: seeded.workoutId, name: "Day A" },
  });

  it("lists only the User's Workout Sessions, newest first, with counts", async () => {
    expect(await getAs(owner, "/v1/workout-sessions")).toEqual({
      body: {
        data: [openSummary(), finishedSummary()],
        hasMore: false,
        total: 2,
      },
      status: 200,
    });
  });

  it("filters by status", async () => {
    const inProgress = await getAs(
      owner,
      "/v1/workout-sessions?status=in_progress"
    );
    const finished = await getAs(owner, "/v1/workout-sessions?status=finished");

    expect(inProgress.body).toEqual({
      data: [openSummary()],
      hasMore: false,
      total: 1,
    });
    expect(finished.body).toEqual({
      data: [finishedSummary()],
      hasMore: false,
      total: 1,
    });
  });

  it("pages, and answers an empty page with the total past the end", async () => {
    expect((await getAs(owner, "/v1/workout-sessions?limit=1")).body).toEqual({
      data: [openSummary()],
      hasMore: true,
      total: 2,
    });
    expect(
      (await getAs(owner, "/v1/workout-sessions?limit=1&offset=1")).body
    ).toEqual({ data: [finishedSummary()], hasMore: false, total: 2 });
    expect((await getAs(owner, "/v1/workout-sessions?offset=5")).body).toEqual({
      data: [],
      hasMore: false,
      total: 2,
    });
  });
});

describe("GET /v1/workout-sessions/:id against the local stack", () => {
  it("reads the Workout Session in full, Exercises by slug, weights in the User's unit", async () => {
    const { body, status } = await getAs(
      owner,
      `/v1/workout-sessions/${seeded.openId}`
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      data: {
        exercises: [
          {
            exercise_slug: benchSlug,
            id: expect.any(String),
            order: 1,
            sets: [
              {
                id: expect.any(String),
                logged_at: "2026-10-02T10:10:00+00:00",
                order: 1,
                reps_completed: 8,
                reps_recommended: 8,
                rest_recommended: 90,
                weight_completed: 135.5,
                weight_recommended: 135.5,
              },
              {
                id: expect.any(String),
                logged_at: null,
                order: 2,
                reps_completed: null,
                reps_recommended: 8,
                rest_recommended: null,
                weight_completed: null,
                weight_recommended: 135.5,
              },
            ],
          },
          {
            exercise_slug: squatSlug,
            id: expect.any(String),
            order: 2,
            sets: [
              {
                id: expect.any(String),
                logged_at: null,
                order: 1,
                reps_completed: null,
                reps_recommended: 5,
                rest_recommended: 120,
                weight_completed: null,
                weight_recommended: 225,
              },
            ],
          },
        ],
        finished_at: null,
        id: seeded.openId,
        plan: { id: seeded.planId, name: "Sessions plan" },
        started_at: "2026-10-02T10:00:00.123456+00:00",
        status: "in_progress",
        weight_unit: "lbs",
        workout: { id: seeded.workoutId, name: "Day A" },
      },
    });
  });

  it("answers kg for a User without a Profile", async () => {
    const { body, status } = await getAs(
      intruder,
      `/v1/workout-sessions/${seeded.intruderId}`
    );

    expect(status).toBe(200);
    expect(body.data.weight_unit).toBe("kg");
    expect(body.data.plan).toBeNull();
    expect(body.data.workout).toBeNull();
  });

  it("answers 404 not_found for a missing id", async () => {
    expect(await getAs(owner, `/v1/workout-sessions/${MISSING_ID}`)).toEqual({
      body: {
        error: { code: "not_found", message: "Workout Session not found" },
      },
      status: 404,
    });
  });
});

describe("Workout Session reads across Users", () => {
  it("answers 404 for another User's Workout Session, either way round", async () => {
    // Each request is its own asUser transaction, so they may run together.
    const answers = await Promise.all([
      getAs(intruder, `/v1/workout-sessions/${seeded.openId}`),
      getAs(intruder, `/v1/workout-sessions/${seeded.finishedId}`),
      getAs(owner, `/v1/workout-sessions/${seeded.intruderId}`),
    ]);

    expect(answers.map(({ status }) => status)).toEqual([404, 404, 404]);
  });

  it("never lists another User's Workout Sessions", async () => {
    const { body } = await getAs(intruder, "/v1/workout-sessions");

    expect(body.total).toBe(1);
    expect(body.data.map((session: { id: string }) => session.id)).toEqual([
      seeded.intruderId,
    ]);
  });
});
