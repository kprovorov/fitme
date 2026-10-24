import { randomBytes } from "node:crypto";
import { plans, profiles, withService } from "@fitme/db";
import { createFakeExerciseLibrary } from "@fitme/exercise-library/fake";
import { deleteUserData } from "@fitme/services/delete-user-data";
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
 * User's Workouts, Workout Sessions or sets. Exercise slugs are seeded ones
 * (until the contract step a slug write needs its slug in the legacy table).
 */
const library = createFakeExerciseLibrary(
  ["barbell-back-squat", "barbell-deadlift"].map(libraryExercise)
);
const reported: unknown[] = [];
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createExerciseLibrary: () => library,
  createServices: createServicesFromEnv,
  identifyUser: () => undefined,
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
  await withService(async (tx) => {
    await deleteUserData(tx, owner);
    await deleteUserData(tx, intruder);
  });
});

describe("a Workout Session through the Public API against the local stack", () => {
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
    expect(resumed.body).toEqual(first.body);
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
    expect(logged.body.data.logged_at).toEqual(expect.any(String));

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

    expect(
      (
        await request(owner, "POST", "/v1/workout-sessions", {
          workout_id: intruderRun.workoutIds[1],
        })
      ).status
    ).toBe(404);
    expect(
      (
        await request(
          owner,
          "PATCH",
          `/v1/workout-session-sets/${intruderRun.setIds[0]}`,
          { reps_completed: 1, weight_completed: 1 }
        )
      ).status
    ).toBe(404);
    expect(
      (
        await request(
          owner,
          "POST",
          `/v1/workout-sessions/${intruderRun.sessionId}/finish`
        )
      ).status
    ).toBe(404);
    expect(
      (
        await request(
          owner,
          "DELETE",
          `/v1/workout-sessions/${intruderRun.sessionId}`
        )
      ).status
    ).toBe(204);

    const after = await request(
      intruder,
      "GET",
      `/v1/workout-sessions/${intruderRun.sessionId}`
    );
    expect(after).toEqual(before);
    expect(after.body.data.weight_unit).toBe("kg");
    expect(await rotation(intruder, intruderRun.planId)).toEqual(planBefore);
    const intruderSessions = await request(
      intruder,
      "GET",
      "/v1/workout-sessions"
    );
    expect(intruderSessions.body.total).toBe(1);
  });

  it("finishes once, rotating the Workout to the end of the Plan, then answers already_finished", async () => {
    const [dayA, dayB] = ownerRun.workoutIds;
    expect(await rotation(owner, ownerRun.planId)).toEqual([
      [dayA, 1],
      [dayB, 2],
    ]);

    const finished = await request(
      owner,
      "POST",
      `/v1/workout-sessions/${ownerRun.sessionId}/finish`
    );

    expect(finished.status).toBe(200);
    expect(finished.body.already_finished).toBe(false);
    expect(finished.body.data).toMatchObject({
      id: ownerRun.sessionId,
      status: "finished",
      weight_unit: "lbs",
    });
    expect(finished.body.data.finished_at).toEqual(expect.any(String));
    expect(await rotation(owner, ownerRun.planId)).toEqual([
      [dayB, 1],
      [dayA, 2],
    ]);

    const repeated = await request(
      owner,
      "POST",
      `/v1/workout-sessions/${ownerRun.sessionId}/finish`
    );

    expect(repeated.status).toBe(200);
    expect(repeated.body).toEqual({ ...finished.body, already_finished: true });
    expect(await rotation(owner, ownerRun.planId)).toEqual([
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
    expect(
      await request(owner, "GET", `/v1/workout-sessions/${ownerRun.sessionId}`)
    ).toEqual(before);
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

  it("deletes the Workout Session, and answers 204 again on a repeat", async () => {
    const path = `/v1/workout-sessions/${ownerRun.sessionId}`;

    expect((await request(owner, "DELETE", path)).status).toBe(204);
    expect((await request(owner, "DELETE", path)).status).toBe(204);
    expect((await request(owner, "GET", path)).status).toBe(404);
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
    expect(reported).toEqual([]);
  });
});
