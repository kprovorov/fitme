import { randomBytes } from "node:crypto";
import { asUser, workoutSessionExercises } from "@fitme/db";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, libraryExercise, signedInAs } from "../src/test/harness.js";

/**
 * The Plan Update through the Public API with the real services facade,
 * through `asUser` on the local stack's pooler: previewed and applied end to
 * end, applied once however often it's asked.
 */
const library = createFakeLibrary(
  ["barbell-back-squat", "barbell-deadlift"].map(libraryExercise)
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

const owner = testUserId("planUpdateOwner");
const intruder = testUserId("planUpdateIntruder");

const onePlan = {
  description: "One day",
  experience_level: "intermediate",
  frequency: 1,
  goal: "muscle-gain",
  name: "Plan Update",
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

const request = async (userId: string, method: string, path: string) => {
  const response = await app.request(path, {
    headers: signedInAs(userId),
    method,
  });
  const text = await response.text();
  return {
    body: text ? JSON.parse(text) : null,
    status: response.status,
  };
};

const send = (userId: string, method: string, path: string, body: unknown) =>
  app.request(path, {
    body: JSON.stringify(body),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method,
  });

const planUpdatePath = (sessionId: string) =>
  `/v1/workout-sessions/${sessionId}/plan-update`;

/**
 * A new Plan of `owner` and an open Workout Session of its Workout, in which
 * the squat (its one set logged at 10×40) has been swapped for a lunge and
 * the deadlift removed: the Plan Update replaces one and removes the other.
 * The swap and removal are written straight to the rows, as installed builds
 * still do (no API route edits a Workout Session's Exercises in place yet).
 */
const sessionWithChanges = async () => {
  const created = await send(owner, "POST", "/v1/plans", onePlan);
  const plan = (await created.json()).data;
  const [workout] = plan.workouts;
  const started = await send(owner, "POST", "/v1/workout-sessions", {
    workout_id: workout.id,
  });
  const session = (await started.json()).data;
  const [squat, deadlift] = session.exercises;
  await send(owner, "PATCH", `/v1/workout-session-sets/${squat.sets[0].id}`, {
    reps_completed: 10,
    weight_completed: 40,
  });
  await asUser(owner, async (tx) => {
    await tx
      .delete(workoutSessionExercises)
      .where(eq(workoutSessionExercises.id, deadlift.id));
    await tx
      .update(workoutSessionExercises)
      .set({ exerciseSlug: "walking-lunge" })
      .where(
        and(
          eq(workoutSessionExercises.id, squat.id),
          eq(workoutSessionExercises.workoutSessionId, session.id)
        )
      );
  });
  return {
    planId: plan.id as string,
    sessionId: session.id as string,
    workoutId: workout.id as string,
  };
};

const finish = (sessionId: string) =>
  request(owner, "POST", `/v1/workout-sessions/${sessionId}/finish`);

/** The Plan's one Workout, its Exercises and sets as targets. */
const workoutOf = async (planId: string) => {
  const { body } = await request(owner, "GET", `/v1/plans/${planId}`);
  return body.data.workouts[0].exercises.map(
    (exercise: {
      exercise_slug: string;
      order: number;
      sets: Record<string, number>[];
    }) => ({
      exercise_slug: exercise.exercise_slug,
      order: exercise.order,
      sets: exercise.sets.map((set) => ({
        reps: set.reps_recommended,
        rest: set.rest_recommended,
        weight: set.weight_recommended,
      })),
    })
  );
};

const expectedChanges = [
  {
    exercise_slug: "walking-lunge",
    kind: "replace_exercise",
    replaced_exercise_slug: "barbell-back-squat",
    sets: [{ reps: 10, weight: 40 }],
  },
  { exercise_slug: "barbell-deadlift", kind: "remove_exercise" },
];

const updatedWorkout = [
  {
    exercise_slug: "walking-lunge",
    order: 1,
    sets: [{ reps: 10, rest: 120, weight: 40 }],
  },
];

afterAll(async () => {
  await deleteTestUsers([owner, intruder]);
});

describe("the Plan Update", () => {
  it("has no changes while the Workout Session is open", async () => {
    const { planId, sessionId, workoutId } = await sessionWithChanges();

    const preview = await request(owner, "GET", planUpdatePath(sessionId));

    expect(preview).toEqual({
      body: {
        data: {
          changes: [],
          plan: { id: planId, name: "Plan Update" },
          weight_unit: "kg",
          workout: { id: workoutId, name: "Day A" },
        },
      },
      status: 200,
    });
  });

  it("previews without writing, applies once, then answers no changes", async () => {
    const { planId, sessionId, workoutId } = await sessionWithChanges();
    await finish(sessionId);
    const before = await workoutOf(planId);

    const preview = await request(owner, "GET", planUpdatePath(sessionId));
    expect(preview.status).toBe(200);
    expect(preview.body.data).toEqual({
      changes: expectedChanges,
      plan: { id: planId, name: "Plan Update" },
      weight_unit: "kg",
      workout: { id: workoutId, name: "Day A" },
    });
    expect(await workoutOf(planId)).toEqual(before);

    const applied = await request(owner, "POST", planUpdatePath(sessionId));
    expect(applied.status).toBe(200);
    expect(applied.body).toEqual(preview.body);
    expect(await workoutOf(planId)).toEqual(updatedWorkout);

    for (const method of ["GET", "POST"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one after the other, on purpose
      const again = await request(owner, method, planUpdatePath(sessionId));
      expect(again.body.data.changes).toEqual([]);
    }
    expect(await workoutOf(planId)).toEqual(updatedWorkout);
  });

  it("writes once for concurrent applies", async () => {
    const { planId, sessionId } = await sessionWithChanges();
    await finish(sessionId);

    const applies = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(owner, "POST", planUpdatePath(sessionId))
      )
    );

    expect(applies.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(applies.map(({ body }) => body.data.changes.length).sort()).toEqual([
      0, 0, 2,
    ]);
    expect(await workoutOf(planId)).toEqual(updatedWorkout);
  });

  it("answers 404 for another User's Workout Session, writing nothing", async () => {
    const { planId, sessionId } = await sessionWithChanges();
    await finish(sessionId);
    const before = await workoutOf(planId);

    for (const method of ["GET", "POST"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one after the other, on purpose
      const refused = await request(
        intruder,
        method,
        planUpdatePath(sessionId)
      );
      expect(refused.status).toBe(404);
      expect(refused.body.error.code).toBe("not_found");
    }
    expect(await workoutOf(planId)).toEqual(before);
    const own = await request(owner, "GET", planUpdatePath(sessionId));
    expect(own.body.data.changes).toEqual(expectedChanges);
  });

  it("has no Workout once its Plan is deleted", async () => {
    const { planId, sessionId } = await sessionWithChanges();
    await finish(sessionId);
    await request(owner, "DELETE", `/v1/plans/${planId}`);

    const applied = await request(owner, "POST", planUpdatePath(sessionId));

    expect(applied.body.data).toEqual({
      changes: [],
      plan: null,
      weight_unit: "kg",
      workout: null,
    });
  });
});
