import { randomBytes } from "node:crypto";
import {
  plans,
  profiles,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { deleteUserData } from "@fitme/services/delete-user-data";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * A write racing an account deletion queues behind it instead of
 * deadlocking: deleteUserData holds its table locks and then deletes the
 * Profile row, which a write share-locks for its weight unit. So a write must
 * take its table locks before that row lock, never after.
 */
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  identifyUser: () => undefined,
  reportError: (error) => Promise.reject(error),
});

const user = `user_apiLocks${randomBytes(16).toString("hex")}`;
const POLL_MS = 50;
const WAIT_LIMIT_MS = 5000;

let workoutId: string;

/** Resolves once some backend waits on a lock it hasn't been granted. */
const lockWaitSeen = async () => {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: polling one at a time
    const { rows } = await withService((tx) =>
      tx.execute(sql`select 1 from pg_locks where not granted limit 1`)
    );
    if (rows.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error("The request never waited on a lock");
};

beforeAll(async () => {
  await withService(async (tx) => {
    await tx.insert(profiles).values({
      age: 30,
      gender: "male",
      height: "180",
      measurementSystem: "metric",
      userId: user,
      weight: "80",
    });
    const [plan] = await tx
      .insert(plans)
      .values({
        frequency: 3,
        goal: "general",
        name: "Locks plan",
        place: "gym",
        userId: user,
      })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({ description: "A", name: "Day A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });
    workoutId = workout.id;
  });
});

afterAll(async () => {
  await withService((tx) => deleteUserData(tx, user));
});

describe("a write racing an account deletion against the local stack", () => {
  it("waits for the deletion's table locks before locking the Profile row", async () => {
    let started: Promise<Response> | undefined;
    await withService(async (tx) => {
      // deleteUserData's first step: every User table, in its order.
      await tx.execute(sql`
        lock table ${profiles}, ${plans}, ${workoutSessions}, ${workouts},
          ${workoutExercises}, ${workoutExerciseSets},
          ${workoutSessionExercises}, ${workoutSessionExerciseSets}
        in share row exclusive mode
      `);
      started = Promise.resolve(
        app.request("/v1/workout-sessions", {
          body: JSON.stringify({ workout_id: workoutId }),
          headers: { ...signedInAs(user), "content-type": "application/json" },
          method: "POST",
        })
      );
      await lockWaitSeen();
      // Then it deletes the Profile row: a deadlock here if the request
      // share-locked it before asking for a table lock.
      await tx.delete(profiles).where(eq(profiles.userId, user));
    });

    if (!started) {
      throw new Error("The request was never sent");
    }
    const response = await started;
    // The Profile is gone by then: the Workout Session starts in kg.
    expect(response.status).toBe(201);
    expect((await response.json()).data.weight_unit).toBe("kg");
  });
});
