import { randomUUID } from "node:crypto";
import {
  asUser,
  plans,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteUserData } from "../src/delete-user-data";
import { getExerciseHistory } from "../src/exercises";

/**
 * The Exercise history service through asUser, against a local Supabase stack
 * via the Supavisor pooler as the fitme login. Made-up Clerk-style User ids
 * and Exercise slugs, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcExOwner${runId}`;
const intruder = `user_svcExIntruder${runId}`;
const alphaSlug = `alpha-${runId}`;

interface SeededSession {
  planId: string;
  sessionExerciseId: string;
  sessionId: string;
  workoutId: string;
}

/**
 * A Plan with one Workout and a Workout Session in it, holding one entry of
 * `alphaSlug` with the given sets (`null` = no weight logged).
 */
const seedSession = (
  userId: string,
  createdAt: string,
  weights: (number | null)[]
): Promise<SeededSession> =>
  withService(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        frequency: 3,
        goal: "general",
        name: `Plan ${createdAt}`,
        place: "gym",
        userId,
      })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({
        description: "Day A",
        name: "Day A",
        order: 1,
        planId: plan.id,
      })
      .returning({ id: workouts.id });
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        finishedAt: createdAt,
        planId: plan.id,
        startedAt: createdAt,
        userId,
        workoutId: workout.id,
      })
      .returning({ id: workoutSessions.id });
    const [sessionExercise] = await tx
      .insert(workoutSessionExercises)
      .values({
        createdAt,
        exerciseSlug: alphaSlug,
        order: 1,
        workoutSessionId: session.id,
      })
      .returning({ id: workoutSessionExercises.id });
    // inserted out of order, to show the sets come back by `order`
    await tx.insert(workoutSessionExerciseSets).values(
      weights
        .map((weight, index) => ({
          order: index + 1,
          repsCompleted: 8 - index,
          weightCompleted: weight === null ? null : String(weight),
          workoutSessionExerciseId: sessionExercise.id,
        }))
        .reverse()
    );
    return {
      planId: plan.id,
      sessionExerciseId: sessionExercise.id,
      sessionId: session.id,
      workoutId: workout.id,
    };
  });

let older: SeededSession;
let newer: SeededSession;
let intruders: SeededSession;

beforeAll(async () => {
  older = await seedSession(owner, "2026-10-01T10:00:00+00:00", [75, 80, null]);
  // only a set without a weight: skipped
  await seedSession(owner, "2026-10-02T10:00:00+00:00", [null]);
  newer = await seedSession(owner, "2026-10-03T10:00:00+00:00", [85]);
  intruders = await seedSession(intruder, "2026-10-04T10:00:00+00:00", [200]);
});

afterAll(async () => {
  await withService(async (tx) => {
    await deleteUserData(tx, owner);
    await deleteUserData(tx, intruder);
  });
});

describe("getExerciseHistory", () => {
  const history = (userId: string, limit = 10) =>
    asUser(userId, (tx) =>
      getExerciseHistory(tx, userId, { exerciseSlug: alphaSlug, limit })
    );

  it("returns the User's entries newest first, with weighted sets in order", async () => {
    expect(await history(owner)).toEqual([
      {
        finished_at: "2026-10-03T10:00:00+00:00",
        plan: { id: newer.planId, name: "Plan 2026-10-03T10:00:00+00:00" },
        session_exercise_id: newer.sessionExerciseId,
        session_id: newer.sessionId,
        sets: [
          {
            id: expect.any(String),
            logged_at: null,
            order: 1,
            reps_completed: 8,
            weight_completed: 85,
          },
        ],
        started_at: "2026-10-03T10:00:00+00:00",
        workout: { id: newer.workoutId, name: "Day A" },
      },
      {
        finished_at: "2026-10-01T10:00:00+00:00",
        plan: { id: older.planId, name: "Plan 2026-10-01T10:00:00+00:00" },
        session_exercise_id: older.sessionExerciseId,
        session_id: older.sessionId,
        sets: [
          expect.objectContaining({ order: 1, weight_completed: 75 }),
          expect.objectContaining({ order: 2, weight_completed: 80 }),
        ],
        started_at: "2026-10-01T10:00:00+00:00",
        workout: { id: older.workoutId, name: "Day A" },
      },
    ]);
  });

  it("counts entries towards the limit", async () => {
    expect((await history(owner, 1)).map((entry) => entry.session_id)).toEqual([
      newer.sessionId,
    ]);
  });

  it("never includes another User's Workout Sessions", async () => {
    expect((await history(intruder)).map((entry) => entry.session_id)).toEqual([
      intruders.sessionId,
    ]);
    expect(
      await asUser(owner, (tx) =>
        getExerciseHistory(tx, intruder, {
          exerciseSlug: alphaSlug,
          limit: 10,
        })
      )
    ).toEqual([]);
  });

  it("shows a Workout Session whose Plan and Workout are gone without them", async () => {
    const orphan = await seedSession(owner, "2026-09-01T10:00:00+00:00", [60]);
    await withService((tx) =>
      tx.delete(plans).where(inArray(plans.id, [orphan.planId]))
    );

    const entries = await history(owner);

    expect(entries.at(-1)).toMatchObject({
      plan: null,
      session_id: orphan.sessionId,
      workout: null,
    });
  });
});
