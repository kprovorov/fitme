import { randomBytes } from "node:crypto";

import {
  profiles,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * The Lifetime totals with the real services facade, through `asUser` on the
 * local stack's pooler, as made-up Clerk-style User ids with test-signed
 * session tokens.
 */
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  identifyUser: () => {},
  reportError: Promise.reject.bind(Promise),
});

const runId = randomBytes(8).toString("hex");
const owner = `user_apiTotalsOwner${runId}`;
const intruder = `user_apiTotalsIntruder${runId}`;

/** One Workout Session of `userId`, its sets (reps, weight) under one Exercise. */
const seedSession = async (
  tx: Parameters<Parameters<typeof withService>[0]>[0],
  {
    finishedAt,
    sets,
    startedAt,
    userId,
  }: {
    finishedAt: string | null;
    sets: [reps: number | null, weight: number | null][];
    startedAt: string;
    userId: string;
  }
) => {
  const [session] = await tx
    .insert(workoutSessions)
    .values({ finishedAt, startedAt, userId })
    .returning({ id: workoutSessions.id });

  const [exercise] = await tx
    .insert(workoutSessionExercises)
    .values({
      exerciseSlug: "barbell-back-squat",
      order: 1,
      workoutSessionId: session.id,
    })
    .returning({ id: workoutSessionExercises.id });

  await tx.insert(workoutSessionExerciseSets).values(
    sets.map(([reps, weight], index) => ({
      loggedAt: reps === null ? null : startedAt,
      order: index + 1,
      repsCompleted: reps,
      repsRecommended: 10,
      restRecommended: 90,
      weightCompleted: weight === null ? null : String(weight),
      weightRecommended: "0",
      workoutSessionExerciseId: exercise.id,
    }))
  );
};

const seed = () =>
  withService(async (tx) => {
    // us: the owner's weights are in lbs; the intruder has no Profile.
    await tx.insert(profiles).values({
      age: 35,
      gender: "female",
      height: "65",
      measurementSystem: "us",
      userId: owner,
      weight: "150",
    });

    // qualifies: an hour, 8 × 100 + a bodyweight set
    await seedSession(tx, {
      finishedAt: "2026-10-01T11:00:00Z",
      sets: [
        [8, 100],
        [12, null],
      ],
      startedAt: "2026-10-01T10:00:00Z",
      userId: owner,
    });

    // qualifies: half an hour, 5 × 135.5
    await seedSession(tx, {
      finishedAt: "2026-10-02T10:30:00Z",
      sets: [[5, 135.5]],
      startedAt: "2026-10-02T10:00:00Z",
      userId: owner,
    });

    // finished with zero reps: doesn't count
    await seedSession(tx, {
      finishedAt: "2026-10-03T11:00:00Z",
      sets: [[0, 200]],
      startedAt: "2026-10-03T10:00:00Z",
      userId: owner,
    });

    // still open: doesn't count
    await seedSession(tx, {
      finishedAt: null,
      sets: [[10, 300]],
      startedAt: "2026-10-04T10:00:00Z",
      userId: owner,
    });

    // another User's: never in the owner's totals
    await seedSession(tx, {
      finishedAt: "2026-10-05T12:00:00Z",
      sets: [[20, 50]],
      startedAt: "2026-10-05T10:00:00Z",
      userId: intruder,
    });
  });

/** The status and body of the Lifetime totals as `userId`. */
const totalsAs = async (userId: string) => {
  const response = await app.request("/v1/workout-sessions/totals", {
    headers: signedInAs(userId),
  });

  return { body: await response.json(), status: response.status };
};

describe("gET /v1/workout-sessions/totals against the local stack", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await deleteTestUsers([owner, intruder]);
  });

  it("sums the qualifying Workout Sessions only, in the User's unit", async () => {
    await expect(totalsAs(owner)).resolves.toStrictEqual({
      body: {
        // 1 h + 30 min; 8 × 100 + 5 × 135.5
        data: { duration_seconds: 5400, volume: 1477.5, workout_count: 2 },
        weight_unit: "lbs",
      },
      status: 200,
    });
  });

  it("answers each User their own totals", async () => {
    await expect(totalsAs(intruder)).resolves.toStrictEqual({
      body: {
        data: { duration_seconds: 7200, volume: 1000, workout_count: 1 },
        // no Profile: metric, so kg
        weight_unit: "kg",
      },
      status: 200,
    });
  });
});
