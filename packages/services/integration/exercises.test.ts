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

import { getExerciseHistory } from "../src/exercises";
import { deleteTestUsers } from "./delete-test-users";

/**
 * The Exercise history service through asUser, against a local Supabase stack
 * via the Supavisor pooler as the fitme login. Made-up Clerk-style User ids
 * and Exercise slugs, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcExOwner${runId}`;
const intruder = `user_svcExIntruder${runId}`;
const alphaSlug = `alpha-${runId}`;

/** One set to seed: its logged reps (`null` = never logged) and weight. */
interface SeedSet {
  reps: number | null;
  weight: number | null;
}

interface SeededSession {
  planId: string;
  sessionExerciseId: string;
  sessionId: string;
  workoutId: string;
}

/**
 * A Plan with one Workout and a Workout Session in it, holding one entry of
 * `alphaSlug` with the given sets, each with targets (8 reps at 70).
 */
const seedSession = async (
  userId: string,
  startedAt: string,
  sets: SeedSet[]
): Promise<SeededSession> =>
  withService(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        frequency: 3,
        goal: "general",
        name: `Plan ${startedAt}`,
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
        finishedAt: startedAt,
        planId: plan.id,
        startedAt,
        userId,
        workoutId: workout.id,
      })
      .returning({ id: workoutSessions.id });

    const [sessionExercise] = await tx
      .insert(workoutSessionExercises)
      .values({
        createdAt: startedAt,
        exerciseSlug: alphaSlug,
        order: 1,
        workoutSessionId: session.id,
      })
      .returning({ id: workoutSessionExercises.id });

    // inserted out of order, to show the sets come back by `order`
    await tx.insert(workoutSessionExerciseSets).values(
      sets
        .map(({ reps, weight }, index) => ({
          order: index + 1,
          repsCompleted: reps,
          repsRecommended: 8,
          weightCompleted: weight === null ? null : String(weight),
          weightRecommended: "70",
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

const logged = (reps: number, weight: number | null): SeedSet => ({
  reps,
  weight,
});

/** A set nobody logged: no reps, no weight. */
const unlogged: SeedSet = { reps: null, weight: null };

let older: SeededSession;
let bodyweight: SeededSession;
let newer: SeededSession;
let intruders: SeededSession;

beforeAll(async () => {
  older = await seedSession(owner, "2026-10-01T10:00:00+00:00", [
    logged(8, 75),
    logged(7, 80),
    unlogged,
  ]);
  // bodyweight: reps logged, no weight — counted all the same
  bodyweight = await seedSession(owner, "2026-10-02T10:00:00+00:00", [
    logged(12, null),
  ]);
  newer = await seedSession(owner, "2026-10-03T10:00:00+00:00", [
    logged(5, 85),
  ]);
  // nothing logged at all: left out
  await seedSession(owner, "2026-10-04T10:00:00+00:00", [unlogged, unlogged]);
  intruders = await seedSession(intruder, "2026-10-05T10:00:00+00:00", [
    logged(10, 200),
  ]);
});

afterAll(async () => {
  await deleteTestUsers([owner, intruder]);
});

describe(getExerciseHistory, () => {
  const history = async (userId: string, limit = 10, offset = 0) =>
    asUser(userId, async (tx) =>
      getExerciseHistory(tx, userId, {
        exerciseSlug: alphaSlug,
        limit,
        offset,
      })
    );

  it("returns the User's entries newest first, with their logged sets in order and their targets", async () => {
    await expect(history(owner)).resolves.toEqual({
      entries: [
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
              reps_completed: 5,
              reps_recommended: 8,
              weight_completed: 85,
              weight_recommended: 70,
            },
          ],
          started_at: "2026-10-03T10:00:00+00:00",
          workout: { id: newer.workoutId, name: "Day A" },
        },
        {
          finished_at: "2026-10-02T10:00:00+00:00",
          plan: {
            id: bodyweight.planId,
            name: "Plan 2026-10-02T10:00:00+00:00",
          },
          session_exercise_id: bodyweight.sessionExerciseId,
          session_id: bodyweight.sessionId,
          // a bodyweight set: logged reps, no weight
          sets: [
            expect.objectContaining({
              order: 1,
              reps_completed: 12,
              weight_completed: null,
            }),
          ],
          started_at: "2026-10-02T10:00:00+00:00",
          workout: { id: bodyweight.workoutId, name: "Day A" },
        },
        {
          finished_at: "2026-10-01T10:00:00+00:00",
          plan: { id: older.planId, name: "Plan 2026-10-01T10:00:00+00:00" },
          session_exercise_id: older.sessionExerciseId,
          session_id: older.sessionId,
          // the third set was never logged: left out
          sets: [
            expect.objectContaining({ order: 1, weight_completed: 75 }),
            expect.objectContaining({ order: 2, weight_completed: 80 }),
          ],
          started_at: "2026-10-01T10:00:00+00:00",
          workout: { id: older.workoutId, name: "Day A" },
        },
      ],
      total: 3,
    });
  });

  it("leaves out an entry whose sets were never logged, in the page and the total", async () => {
    const { entries, total } = await history(owner);

    expect(entries).toHaveLength(3);
    expect(total).toBe(3);
  });

  it("pages the entries, with the total across every page", async () => {
    const first = await history(owner, 2);
    const second = await history(owner, 2, 2);

    expect(first.entries.map((entry) => entry.session_id)).toEqual([
      newer.sessionId,
      bodyweight.sessionId,
    ]);
    expect(first.total).toBe(3);
    expect(second.entries.map((entry) => entry.session_id)).toEqual([
      older.sessionId,
    ]);
    expect(second.total).toBe(3);
  });

  it("answers an empty page past the end, with the total", async () => {
    await expect(history(owner, 10, 10)).resolves.toEqual({
      entries: [],
      total: 3,
    });
  });

  it("answers an empty page for an Exercise the User never did", async () => {
    await expect(
      asUser(owner, async (tx) =>
        getExerciseHistory(tx, owner, {
          exerciseSlug: `unknown-${runId}`,
          limit: 10,
          offset: 0,
        })
      )
    ).resolves.toEqual({ entries: [], total: 0 });
  });

  it("never includes another User's Workout Sessions", async () => {
    const theirs = await history(intruder);
    expect(theirs.entries.map((entry) => entry.session_id)).toEqual([
      intruders.sessionId,
    ]);
    await expect(
      asUser(owner, async (tx) =>
        getExerciseHistory(tx, intruder, {
          exerciseSlug: alphaSlug,
          limit: 10,
          offset: 0,
        })
      )
    ).resolves.toEqual({ entries: [], total: 0 });
  });

  it("shows a Workout Session whose Plan and Workout are gone without them", async () => {
    const orphan = await seedSession(owner, "2026-09-01T10:00:00+00:00", [
      logged(6, 60),
    ]);

    await withService((tx) =>
      tx.delete(plans).where(inArray(plans.id, [orphan.planId]))
    );

    const { entries } = await history(owner);

    expect(entries.at(-1)).toMatchObject({
      plan: null,
      session_id: orphan.sessionId,
      workout: null,
    });
  });
});
