import { randomBytes } from "node:crypto";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, libraryExercise, signedInAs } from "../src/test/harness.js";

/**
 * Editing an open Workout Session's Exercises through the Public API with the
 * real services facade, through `asUser` on the local stack's pooler.
 */
const library = createFakeLibrary(
  ["barbell-back-squat", "barbell-deadlift", "walking-lunge"].map(
    libraryExercise
  )
);
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createLibrary: () => library,
  createServices: createServicesFromEnv,
  identifyUser: () => undefined,
  reportError: () => Promise.resolve(),
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("sessionEditOwner");
const intruder = testUserId("sessionEditIntruder");

const onePlan = {
  description: "One day",
  experience_level: "intermediate",
  frequency: 1,
  goal: "muscle-gain",
  name: "Session edits",
  place: "gym",
  workout_duration: 60,
  workouts: [
    {
      description: "Legs",
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          sets: [
            {
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 100,
            },
          ],
        },
        {
          exercise_slug: "barbell-deadlift",
          sets: [
            {
              reps_recommended: 5,
              rest_recommended: 180,
              weight_recommended: 140,
            },
          ],
        },
      ],
      name: "Day A",
    },
  ],
};

const request = async (
  userId: string,
  method: string,
  path: string,
  body?: unknown
) => {
  const response = await app.request(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      ...signedInAs(userId),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    method,
  });
  const text = await response.text();
  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
};

/** A Workout Session started through the API on a new Plan's Workout: 2 Exercises. */
const startSession = async (userId: string) => {
  const created = await request(userId, "POST", "/v1/plans", onePlan);
  if (created.status !== 201) {
    throw new Error(`Creating a Plan answered ${created.status}`);
  }
  const started = await request(userId, "POST", "/v1/workout-sessions", {
    workout_id: created.body.data.workouts[0].id,
  });
  if (started.status !== 201) {
    throw new Error(`Starting a Workout Session answered ${started.status}`);
  }
  return started.body.data.id as string;
};

const addLunge = (userId: string, sessionId: string) =>
  request(userId, "POST", `/v1/workout-sessions/${sessionId}/exercises`, {
    exercise_slug: "walking-lunge",
  });

const exerciseOrders = async (sessionId: string) => {
  const { body } = await request(
    owner,
    "GET",
    `/v1/workout-sessions/${sessionId}`
  );
  return body.data.exercises.map(
    ({ exercise_slug, order }: { exercise_slug: string; order: number }) => ({
      exercise_slug,
      order,
    })
  );
};

afterAll(async () => {
  await deleteTestUsers([owner, intruder]);
});

describe("POST /v1/workout-sessions/:id/exercises", () => {
  it("appends the Exercise with no sets and answers it with the weight unit", async () => {
    const sessionId = await startSession(owner);

    const added = await addLunge(owner, sessionId);

    expect(added.status).toBe(201);
    expect(added.body).toEqual({
      data: {
        exercise_slug: "walking-lunge",
        id: expect.any(String),
        order: 3,
        sets: [],
        weight_unit: "kg",
      },
    });
    expect(await exerciseOrders(sessionId)).toEqual([
      { exercise_slug: "barbell-back-squat", order: 1 },
      { exercise_slug: "barbell-deadlift", order: 2 },
      { exercise_slug: "walking-lunge", order: 3 },
    ]);
  });

  it("gives concurrent adds distinct, consecutive orders", async () => {
    const sessionId = await startSession(owner);

    const added = await Promise.all(
      Array.from({ length: 4 }, () => addLunge(owner, sessionId))
    );

    expect(added.map(({ status }) => status)).toEqual([201, 201, 201, 201]);
    expect(
      added.map(({ body }) => body.data.order).sort((a, b) => a - b)
    ).toEqual([3, 4, 5, 6]);
    expect(
      (await exerciseOrders(sessionId)).map(
        ({ order }: { order: number }) => order
      )
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("refuses a finished Workout Session with 409, writing nothing", async () => {
    const sessionId = await startSession(owner);
    await request(owner, "POST", `/v1/workout-sessions/${sessionId}/finish`);

    const refused = await addLunge(owner, sessionId);

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("session_finished");
    expect(await exerciseOrders(sessionId)).toHaveLength(2);
  });

  it("answers 404 for another User's Workout Session, writing nothing", async () => {
    const sessionId = await startSession(owner);

    const refused = await addLunge(intruder, sessionId);

    expect(refused.status).toBe(404);
    expect(await exerciseOrders(sessionId)).toHaveLength(2);
  });
});
