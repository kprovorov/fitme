import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  plans,
  profiles,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import {
  deleteTestUsers,
  withUserTablesLocked,
} from "@fitme/services/delete-test-users";
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
  identifyUser: () => {},
  reportError: Promise.reject.bind(Promise),
});

const user = `user_apiLocks${randomBytes(16).toString("hex")}`;
const POLL_MS = 50;
const WAIT_LIMIT_MS = 5000;

let workoutId: string;
let loggedSetId: string;

/** Resolves once some backend waits on a lock it hasn't been granted. */
const lockWaitSeen = async (
  deadline = Date.now() + WAIT_LIMIT_MS
): Promise<void> => {
  if (Date.now() >= deadline) {
    throw new Error("The request never waited on a lock");
  }

  const { rows } = await withService((tx) =>
    tx.execute(sql`select 1 from pg_locks where not granted limit 1`)
  );

  if (rows.length > 0) {
    return;
  }

  await delay(POLL_MS);

  await lockWaitSeen(deadline);
};

describe("a write racing an account deletion against the local stack", () => {
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

      // A finished Workout Session with one logged set, for the note write.
      const [session] = await tx
        .insert(workoutSessions)
        .values({
          finishedAt: "2026-10-01T11:00:00Z",
          startedAt: "2026-10-01T10:00:00Z",
          userId: user,
        })
        .returning({ id: workoutSessions.id });

      const [exercise] = await tx
        .insert(workoutSessionExercises)
        .values({
          exerciseSlug: "barbell-back-squat",
          order: 1,
          workoutSessionId: session.id,
        })
        .returning({ id: workoutSessionExercises.id });

      const [set] = await tx
        .insert(workoutSessionExerciseSets)
        .values({
          loggedAt: "2026-10-01T10:05:00Z",
          order: 1,
          repsCompleted: 8,
          weightCompleted: "80",
          workoutSessionExerciseId: exercise.id,
        })
        .returning({ id: workoutSessionExerciseSets.id });

      loggedSetId = set.id;
    });
  });

  afterAll(async () => {
    await deleteTestUsers([user]);
  });

  it("waits for the deletion's table locks before locking the Profile row", async () => {
    let started: Promise<Response> | undefined;
    // deleteUserData's first step: every User table, in its order.
    await withUserTablesLocked(async (tx) => {
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
    const body = await response.json();
    expect(body.data.weight_unit).toBe("kg");
  });

  it("waits for them before locking the Profile row when it sets a set's note", async () => {
    // The test above deleted the Profile: a new one for the row lock.
    await withService((tx) =>
      tx.insert(profiles).values({
        age: 30,
        gender: "male",
        height: "180",
        measurementSystem: "metric",
        userId: user,
        weight: "80",
      })
    );

    let started: Promise<Response> | undefined;
    await withUserTablesLocked(async (tx) => {
      started = Promise.resolve(
        app.request(`/v1/workout-session-sets/${loggedSetId}/note`, {
          body: JSON.stringify({ note: "Felt heavy" }),
          headers: { ...signedInAs(user), "content-type": "application/json" },
          method: "PUT",
        })
      );
      await lockWaitSeen();
      await tx.delete(profiles).where(eq(profiles.userId, user));
    });

    if (!started) {
      throw new Error("The request was never sent");
    }

    const response = await started;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ note: "Felt heavy", weight_unit: "kg" });
  });
});
