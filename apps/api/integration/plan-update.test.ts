import { randomBytes } from "node:crypto";

import { asUser, workoutSessionExercises } from "@fitme/db";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, libraryExercise, signedInAs } from "../src/test/harness.js";

/**
 * The Plan Update through the Public API with the real services facade,
 * through `asUser` on the local stack's pooler: previewed and applied end to
 * end, applied once however often it's asked.
 */
const library = createFakeLibrary(
  ["barbell-back-squat", "barbell-deadlift"].map((slug) =>
    libraryExercise(slug)
  )
);

const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createLibrary: () => library,
  createServices: createServicesFromEnv,
  identifyUser: () => {},
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

type PlanUpdateSetupBody =
  | typeof onePlan
  | { workout_id: string }
  | { reps_completed: number; weight_completed: number };

const send = (
  userId: string,
  method: string,
  path: string,
  body: PlanUpdateSetupBody
) =>
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
  const createdBody = await created.json();
  const plan = createdBody.data;
  const [workout] = plan.workouts;

  const started = await send(owner, "POST", "/v1/workout-sessions", {
    workout_id: workout.id,
  });

  const startedBody = await started.json();
  const session = startedBody.data;
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
    planId: z.string().parse(plan.id),
    sessionId: z.string().parse(session.id),
    workoutId: z.string().parse(workout.id),
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

describe("the Plan Update", () => {
  beforeEach(() => {
    owner = testUserId("planUpdateOwner");
    intruder = testUserId("planUpdateIntruder");
    users.push(owner, intruder);
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("has no changes while the Workout Session is open", async () => {
    const { planId, sessionId, workoutId } = await sessionWithChanges();

    const preview = await request(owner, "GET", planUpdatePath(sessionId));

    expect(preview).toStrictEqual({
      body: {
        data: {
          changes: [],
          plan: { id: planId, name: "Plan Update" },
          weight_unit: "kg",
          workout: { cover: null, id: workoutId, name: "Day A" },
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
    expect(preview).toStrictEqual({
      body: {
        data: {
          changes: expectedChanges,
          plan: { id: planId, name: "Plan Update" },
          weight_unit: "kg",
          workout: { cover: null, id: workoutId, name: "Day A" },
        },
      },
      status: 200,
    });
    await expect(workoutOf(planId)).resolves.toStrictEqual(before);

    const applied = await request(owner, "POST", planUpdatePath(sessionId));
    expect(applied).toStrictEqual(preview);
    await expect(workoutOf(planId)).resolves.toStrictEqual(updatedWorkout);

    const previewAgain = await request(owner, "GET", planUpdatePath(sessionId));
    const applyAgain = await request(owner, "POST", planUpdatePath(sessionId));
    expect({
      appliedChanges: applyAgain.body.data.changes,
      previewChanges: previewAgain.body.data.changes,
      workout: await workoutOf(planId),
    }).toStrictEqual({
      appliedChanges: [],
      previewChanges: [],
      workout: updatedWorkout,
    });
  });

  it("writes once for concurrent applies", async () => {
    const { planId, sessionId } = await sessionWithChanges();
    await finish(sessionId);

    const applies = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(owner, "POST", planUpdatePath(sessionId))
      )
    );

    expect(applies.map(({ status }) => status)).toStrictEqual([200, 200, 200]);
    expect(
      applies.filter(({ body }) => body.data.changes.length === 0)
    ).toHaveLength(2);
    expect(
      applies.filter(({ body }) => body.data.changes.length === 2)
    ).toHaveLength(1);
    await expect(workoutOf(planId)).resolves.toStrictEqual(updatedWorkout);
  });

  it("answers 404 for another User's Workout Session, writing nothing", async () => {
    const { planId, sessionId } = await sessionWithChanges();
    await finish(sessionId);
    const before = await workoutOf(planId);

    const refusedPreview = await request(
      intruder,
      "GET",
      planUpdatePath(sessionId)
    );

    const refusedApply = await request(
      intruder,
      "POST",
      planUpdatePath(sessionId)
    );

    for (const refused of [refusedPreview, refusedApply]) {
      expect(refused.status).toBe(404);
      expect(refused.body.error.code).toBe("not_found");
    }

    await expect(workoutOf(planId)).resolves.toStrictEqual(before);
    const own = await request(owner, "GET", planUpdatePath(sessionId));
    expect(own.body.data.changes).toStrictEqual(expectedChanges);
  });

  it("has no Workout once its Plan is deleted", async () => {
    const { planId, sessionId } = await sessionWithChanges();
    await finish(sessionId);
    await request(owner, "DELETE", `/v1/plans/${planId}`);

    const applied = await request(owner, "POST", planUpdatePath(sessionId));

    expect(applied.body.data).toStrictEqual({
      changes: [],
      plan: null,
      weight_unit: "kg",
      workout: null,
    });
  });
});
