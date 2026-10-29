import { randomBytes } from "node:crypto";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
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

/**
 * A fresh owner and intruder per test: a User has at most one open Workout
 * Session, so a test's open session would refuse the next test's start.
 */
const users: string[] = [];
let owner = "";
let intruder = "";
beforeEach(() => {
  owner = testUserId("sessionEditOwner");
  intruder = testUserId("sessionEditIntruder");
  users.push(owner, intruder);
});

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
  await deleteTestUsers(users);
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

/** The Workout Session's Exercises in full, as the API reads them. */
const exercisesOf = async (sessionId: string) => {
  const { body } = await request(
    owner,
    "GET",
    `/v1/workout-sessions/${sessionId}`
  );
  return body.data.exercises as Array<{
    exercise_slug: string;
    id: string;
    order: number;
    sets: Record<string, unknown>[];
  }>;
};

describe("DELETE /v1/workout-session-exercises/:id", () => {
  it("removes the Exercise and its sets, leaving a gap that a later add keeps", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);

    const removed = await request(
      owner,
      "DELETE",
      `/v1/workout-session-exercises/${squat?.id}`
    );

    expect(removed.status).toBe(204);
    expect(await exerciseOrders(sessionId)).toEqual([
      { exercise_slug: "barbell-deadlift", order: 2 },
    ]);
    await addLunge(owner, sessionId);
    expect(await exerciseOrders(sessionId)).toEqual([
      { exercise_slug: "barbell-deadlift", order: 2 },
      { exercise_slug: "walking-lunge", order: 3 },
    ]);
  });

  it("answers 204 for a repeat and for another User's, which stays untouched", async () => {
    const sessionId = await startSession(owner);
    const [squat, deadlift] = await exercisesOf(sessionId);
    const path = `/v1/workout-session-exercises/${squat?.id}`;
    await request(owner, "DELETE", path);

    const repeat = await request(owner, "DELETE", path);
    const intruding = await request(
      intruder,
      "DELETE",
      `/v1/workout-session-exercises/${deadlift?.id}`
    );

    expect(repeat.status).toBe(204);
    expect(intruding.status).toBe(204);
    expect(await exerciseOrders(sessionId)).toEqual([
      { exercise_slug: "barbell-deadlift", order: 2 },
    ]);
  });

  it("refuses an Exercise of a finished Workout Session with 409, removing nothing", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);
    await request(owner, "POST", `/v1/workout-sessions/${sessionId}/finish`);

    const refused = await request(
      owner,
      "DELETE",
      `/v1/workout-session-exercises/${squat?.id}`
    );

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("session_finished");
    expect(await exerciseOrders(sessionId)).toHaveLength(2);
  });
});

describe("PUT /v1/workout-session-exercises/:id", () => {
  it("swaps the slug and zeroes every set's targets in place, keeping the logged values", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);
    const [squatSet] = squat?.sets ?? [];
    await request(owner, "PATCH", `/v1/workout-session-sets/${squatSet?.id}`, {
      reps_completed: 7,
      weight_completed: 95,
    });

    const replaced = await request(
      owner,
      "PUT",
      `/v1/workout-session-exercises/${squat?.id}`,
      { exercise_slug: "walking-lunge" }
    );

    expect(replaced.status).toBe(200);
    expect(replaced.body.data).toMatchObject({
      exercise_slug: "walking-lunge",
      id: squat?.id,
      order: 1,
      sets: [
        {
          id: squatSet?.id,
          reps_completed: 7,
          reps_recommended: 0,
          rest_recommended: 120,
          weight_completed: 95,
          weight_recommended: 0,
        },
      ],
      weight_unit: "kg",
    });
    expect((await exercisesOf(sessionId))[0]).toEqual({
      exercise_slug: "walking-lunge",
      id: squat?.id,
      order: 1,
      sets: replaced.body.data.sets,
    });
  });

  it("refuses a finished Workout Session with 409, changing nothing", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);
    await request(owner, "POST", `/v1/workout-sessions/${sessionId}/finish`);

    const refused = await request(
      owner,
      "PUT",
      `/v1/workout-session-exercises/${squat?.id}`,
      { exercise_slug: "walking-lunge" }
    );

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("session_finished");
    expect((await exercisesOf(sessionId))[0]).toEqual(squat);
  });

  it("answers 404 for another User's and 400 for an unknown slug, changing nothing", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);
    const path = `/v1/workout-session-exercises/${squat?.id}`;

    const intruding = await request(intruder, "PUT", path, {
      exercise_slug: "walking-lunge",
    });
    const unknown = await request(owner, "PUT", path, {
      exercise_slug: "made-up-press",
    });

    expect(intruding.status).toBe(404);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe("unknown_exercises");
    expect((await exercisesOf(sessionId))[0]).toEqual(squat);
  });
});

describe("POST /v1/workout-session-exercises/:id/sets", () => {
  const addSet = (userId: string, sessionExerciseId: string, body?: unknown) =>
    request(
      userId,
      "POST",
      `/v1/workout-session-exercises/${sessionExerciseId}/sets`,
      body ?? { reps_completed: 6, weight_completed: 102.5 }
    );

  it("appends a logged set with the server's time and no targets", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);
    const before = Date.now();

    const added = await addSet(owner, squat?.id as string);

    expect(added.status).toBe(201);
    expect(added.body).toEqual({
      data: {
        id: expect.any(String),
        logged_at: expect.any(String),
        order: 2,
        reps_completed: 6,
        reps_recommended: null,
        rest_recommended: null,
        weight_completed: 102.5,
        weight_recommended: null,
        weight_unit: "kg",
      },
    });
    expect(Date.parse(added.body.data.logged_at)).toBeGreaterThan(
      before - 60_000
    );
    const { weight_unit: _unit, ...shown } = added.body.data;
    expect((await exercisesOf(sessionId))[0]?.sets.at(-1)).toEqual(shown);
  });

  it("gives concurrent adds distinct, consecutive orders", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);

    const added = await Promise.all(
      Array.from({ length: 4 }, () => addSet(owner, squat?.id as string))
    );

    expect(added.map(({ status }) => status)).toEqual([201, 201, 201, 201]);
    expect(
      (await exercisesOf(sessionId))[0]?.sets.map(({ order }) => order)
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("refuses a finished Workout Session with 409, writing nothing", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);
    await request(owner, "POST", `/v1/workout-sessions/${sessionId}/finish`);

    const refused = await addSet(owner, squat?.id as string);

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("session_finished");
    expect((await exercisesOf(sessionId))[0]?.sets).toHaveLength(1);
  });

  it("answers 404 for another User's and 400 for an out-of-bounds or unknown field, writing nothing", async () => {
    const sessionId = await startSession(owner);
    const [squat] = await exercisesOf(sessionId);
    const id = squat?.id as string;

    const intruding = await addSet(intruder, id);
    const outOfBounds = await addSet(owner, id, {
      reps_completed: 6,
      weight_completed: 102.555,
    });
    const unknownField = await addSet(owner, id, {
      reps_completed: 6,
      reps_recommended: 6,
      weight_completed: 100,
    });

    expect(intruding.status).toBe(404);
    expect(outOfBounds.status).toBe(400);
    expect(unknownField.status).toBe(400);
    expect((await exercisesOf(sessionId))[0]?.sets).toHaveLength(1);
  });
});
