import { randomBytes } from "node:crypto";

import { plans, profiles, withService } from "@fitme/db";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, libraryExercise, signedInAs } from "../src/test/harness.js";

/**
 * A Workout Session run end to end through the Public API with the real
 * services facade, through `asUser` on the local stack's pooler: create a
 * Plan, start, log sets, finish, see the Workout rotated and the Workout
 * Session listed as finished, then delete it; and none of it reaching another
 * User's Workouts, Workout Sessions or sets.
 */
const library = createFakeLibrary(
  ["barbell-back-squat", "barbell-deadlift"].map((slug) =>
    libraryExercise(slug)
  )
);

const reported: unknown[] = [];

const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createLibrary: () => library,
  createServices: createServicesFromEnv,
  identifyUser: () => {},
  reportError: (error) => {
    reported.push(error);

    return Promise.resolve();
  },
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("sessionOwner");
const intruder = testUserId("sessionIntruder");

const twoDayPlan = (name: string) => ({
  description: `${name} description`,
  experience_level: "intermediate",
  frequency: 2,
  goal: "muscle-gain",
  name,
  place: "gym",
  workout_duration: 60,
  workouts: [
    {
      description: "Squats",
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          sets: [
            {
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 135,
            },
            {
              reps_recommended: 6,
              rest_recommended: 120,
              weight_recommended: 155,
            },
          ],
        },
      ],
      name: "Day A",
    },
    {
      description: "Deadlifts",
      exercises: [
        {
          exercise_slug: "barbell-deadlift",
          sets: [
            {
              reps_recommended: 5,
              rest_recommended: 180,
              weight_recommended: 185,
            },
          ],
        },
      ],
      name: "Day B",
    },
  ],
});

type SessionFlowBody =
  | ReturnType<typeof twoDayPlan>
  | { workout_id: string }
  | { reps_completed: number; weight_completed: number };

const request = async (
  userId: string,
  method: string,
  path: string,
  body?: SessionFlowBody
) => {
  const headers: ReturnType<typeof signedInAs> & { "content-type"?: string } = {
    ...signedInAs(userId),
  };

  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await app.request(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
  });

  const text = await response.text();

  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
};

interface Ran {
  planId: string;
  sessionId: string;
  setIds: string[];
  workoutIds: string[];
}

/** A Plan created through the API and a Workout Session started on its first Workout. */
const startOne = async (userId: string, name: string): Promise<Ran> => {
  const created = await request(userId, "POST", "/v1/plans", twoDayPlan(name));

  if (created.status !== 201) {
    throw new Error(`Creating a Plan answered ${created.status}`);
  }

  const workoutIds = created.body.data.workouts.map(
    (workout: { id: string }) => workout.id
  );

  const started = await request(userId, "POST", "/v1/workout-sessions", {
    workout_id: workoutIds[0],
  });

  if (started.status !== 201) {
    throw new Error(`Starting a Workout Session answered ${started.status}`);
  }

  return {
    planId: created.body.data.id,
    sessionId: started.body.data.id,
    setIds: started.body.data.exercises.flatMap(
      (exercise: { sets: { id: string }[] }) =>
        exercise.sets.map((set) => set.id)
    ),
    workoutIds,
  };
};

/** The Workout ids of a Plan in rotation order, as the API shows them. */
const rotation = async (userId: string, planId: string) => {
  const { body } = await request(userId, "GET", `/v1/plans/${planId}`);

  return body.data.workouts.map((workout: { id: string; order: number }) => [
    workout.id,
    workout.order,
  ]);
};

let ownerRun: Ran;
let intruderRun: Ran;

describe("a Workout Session through the Public API against the local stack", () => {
  beforeAll(async () => {
    // us: the owner's weights are in lbs; the intruder has no Profile (kg).
    await withService((tx) =>
      tx.insert(profiles).values({
        age: 35,
        gender: "female",
        height: "66",
        measurementSystem: "us",
        userId: owner,
        weight: "150",
      })
    );
    ownerRun = await startOne(owner, "Owner plan");
    intruderRun = await startOne(intruder, "Intruder plan");
  });

  afterAll(async () => {
    await deleteTestUsers([owner, intruder]);
  });

  it("resumes the open Workout Session with 200 and the same body", async () => {
    const first = await request(
      owner,
      "GET",
      `/v1/workout-sessions/${ownerRun.sessionId}`
    );

    const resumed = await request(owner, "POST", "/v1/workout-sessions", {
      workout_id: ownerRun.workoutIds[0],
    });

    expect(resumed.status).toBe(200);
    expect(resumed.body).toStrictEqual(first.body);
    expect(resumed.body.data).toMatchObject({
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          order: 1,
          sets: [
            { order: 1, reps_completed: null, weight_recommended: 135 },
            { order: 2, reps_completed: null, weight_recommended: 155 },
          ],
        },
      ],
      status: "in_progress",
      weight_unit: "lbs",
      workout: { id: ownerRun.workoutIds[0], name: "Day A" },
    });
  });

  it("refuses another Workout with 409 session_in_progress naming the open one, writing nothing", async () => {
    const before = await request(owner, "GET", "/v1/workout-sessions");

    const refused = await request(owner, "POST", "/v1/workout-sessions", {
      workout_id: ownerRun.workoutIds[1],
    });

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("session_in_progress");
    expect(refused.body.error.message).toContain('"Day A"');
    await expect(
      request(owner, "GET", "/v1/workout-sessions")
    ).resolves.toStrictEqual(before);
    expect(reported).toStrictEqual([]);
  });

  it("logs sets in the User's unit", async () => {
    const logged = await request(
      owner,
      "PATCH",
      `/v1/workout-session-sets/${ownerRun.setIds[0]}`,
      { reps_completed: 8, weight_completed: 137.5 }
    );

    expect(logged.status).toBe(200);
    expect(logged.body.data).toMatchObject({
      id: ownerRun.setIds[0],
      reps_completed: 8,
      weight_completed: 137.5,
      weight_unit: "lbs",
    });
    expect(logged.body.data.logged_at).toStrictEqual(expect.any(String));

    const bodyweight = await request(
      owner,
      "PATCH",
      `/v1/workout-session-sets/${ownerRun.setIds[1]}`,
      { reps_completed: 0, weight_completed: 0 }
    );

    expect(bodyweight.status).toBe(200);
  });

  it("never reaches another User's Workout, Workout Session or set", async () => {
    const before = await request(
      intruder,
      "GET",
      `/v1/workout-sessions/${intruderRun.sessionId}`
    );

    const planBefore = await rotation(intruder, intruderRun.planId);

    const started = await request(owner, "POST", "/v1/workout-sessions", {
      workout_id: intruderRun.workoutIds[1],
    });

    const logged = await request(
      owner,
      "PATCH",
      `/v1/workout-session-sets/${intruderRun.setIds[0]}`,
      { reps_completed: 1, weight_completed: 1 }
    );

    const finished = await request(
      owner,
      "POST",
      `/v1/workout-sessions/${intruderRun.sessionId}/finish`
    );

    const deleted = await request(
      owner,
      "DELETE",
      `/v1/workout-sessions/${intruderRun.sessionId}`
    );

    expect({
      deleted: deleted.status,
      finished: finished.status,
      logged: logged.status,
      started: started.status,
    }).toStrictEqual({
      deleted: 204,
      finished: 404,
      logged: 404,
      started: 404,
    });

    const after = await request(
      intruder,
      "GET",
      `/v1/workout-sessions/${intruderRun.sessionId}`
    );

    expect(after).toStrictEqual(before);
    expect(after.body.data.weight_unit).toBe("kg");
    await expect(rotation(intruder, intruderRun.planId)).resolves.toStrictEqual(
      planBefore
    );

    const intruderSessions = await request(
      intruder,
      "GET",
      "/v1/workout-sessions"
    );

    expect(intruderSessions.body.total).toBe(1);
  });

  it("finishes once, rotating the Workout to the end of the Plan, then answers already_finished", async () => {
    const [dayA, dayB] = ownerRun.workoutIds;
    await expect(rotation(owner, ownerRun.planId)).resolves.toStrictEqual([
      [dayA, 1],
      [dayB, 2],
    ]);

    const finished = await request(
      owner,
      "POST",
      `/v1/workout-sessions/${ownerRun.sessionId}/finish`
    );

    expect(finished).toMatchObject({
      body: {
        already_finished: false,
        data: {
          finished_at: expect.any(String),
          id: ownerRun.sessionId,
          status: "finished",
          weight_unit: "lbs",
        },
      },
      status: 200,
    });
    await expect(rotation(owner, ownerRun.planId)).resolves.toStrictEqual([
      [dayB, 1],
      [dayA, 2],
    ]);

    const repeated = await request(
      owner,
      "POST",
      `/v1/workout-sessions/${ownerRun.sessionId}/finish`
    );

    expect(repeated).toStrictEqual({
      body: { ...finished.body, already_finished: true },
      status: 200,
    });
    await expect(rotation(owner, ownerRun.planId)).resolves.toStrictEqual([
      [dayB, 1],
      [dayA, 2],
    ]);
  });

  it("refuses to log a set of the finished Workout Session, writing nothing", async () => {
    const before = await request(
      owner,
      "GET",
      `/v1/workout-sessions/${ownerRun.sessionId}`
    );

    const refused = await request(
      owner,
      "PATCH",
      `/v1/workout-session-sets/${ownerRun.setIds[0]}`,
      { reps_completed: 12, weight_completed: 200 }
    );

    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("session_finished");
    await expect(
      request(owner, "GET", `/v1/workout-sessions/${ownerRun.sessionId}`)
    ).resolves.toStrictEqual(before);
  });

  it("lists the Workout Session as finished", async () => {
    const { body, status } = await request(
      owner,
      "GET",
      "/v1/workout-sessions?status=finished"
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      data: [
        {
          exercise_count: 1,
          id: ownerRun.sessionId,
          logged_set_count: 2,
          set_count: 2,
          status: "finished",
        },
      ],
      hasMore: false,
      total: 1,
    });
  });

  it("starts another Workout with 201 once the open one is finished", async () => {
    const started = await request(owner, "POST", "/v1/workout-sessions", {
      workout_id: ownerRun.workoutIds[1],
    });

    expect(started.status).toBe(201);
    expect(started.body.data.workout).toMatchObject({ name: "Day B" });
    const path = `/v1/workout-sessions/${started.body.data.id}`;
    const deleted = await request(owner, "DELETE", path);
    expect(deleted.status).toBe(204);
  });

  it("deletes the Workout Session, and answers 204 again on a repeat", async () => {
    const path = `/v1/workout-sessions/${ownerRun.sessionId}`;

    const deleted = await request(owner, "DELETE", path);
    expect(deleted.status).toBe(204);
    const repeated = await request(owner, "DELETE", path);
    expect(repeated.status).toBe(204);
    const missing = await request(owner, "GET", path);
    expect(missing.status).toBe(404);
  });

  it("answers 404 for a Workout nobody has", async () => {
    const started = await request(owner, "POST", "/v1/workout-sessions", {
      workout_id: "00000000-0000-4000-8000-000000000000",
    });

    expect(started.status).toBe(404);
  });

  it("answers 404 for a Workout of a deleted Plan", async () => {
    await withService((tx) =>
      tx
        .update(plans)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(plans.id, ownerRun.planId))
    );

    const started = await request(owner, "POST", "/v1/workout-sessions", {
      workout_id: ownerRun.workoutIds[1],
    });

    expect(started.status).toBe(404);
    expect(started.body.error.code).toBe("not_found");
    expect(reported).toStrictEqual([]);
  });
});
