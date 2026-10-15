import { randomUUID } from "node:crypto";
import {
  asUser,
  exercises,
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
import { listWorkoutHistory } from "../src/workout-sessions";

/**
 * listWorkoutHistory through asUser, against a local Supabase stack via the
 * Supavisor pooler as the fitme login. Made-up Clerk-style User ids, unique
 * per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcHistOwner${runId}`;
const intruder = `user_svcHistIntruder${runId}`;

interface Seeded {
  benchId: string;
  /** Started first but finished last: the newest in the history. */
  lateId: string;
  /** Finished in between. */
  middleId: string;
  /** Finished first. */
  oldestId: string;
  openId: string;
  planId: string;
  squatId: string;
  workoutId: string;
}

let seeded: Seeded;
let intruderSessionId: string;

const seedOwner = (): Promise<Seeded> =>
  withService(async (tx) => {
    const [bench, squat] = await tx
      .insert(exercises)
      .values([
        { name: "Test bench", slug: `test-hist-bench-${runId}` },
        { name: "Test squat", slug: `test-hist-squat-${runId}` },
      ])
      .returning({ id: exercises.id });
    const [plan] = await tx
      .insert(plans)
      .values({
        frequency: 3,
        goal: "muscle-gain",
        name: "History plan",
        place: "gym",
        userId: owner,
      })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({ description: "A", name: "Day A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });

    const [late, oldest, middle, open] = await tx
      .insert(workoutSessions)
      .values([
        {
          finishedAt: "2026-10-05T12:00:00Z",
          planId: plan.id,
          startedAt: "2026-09-30T10:00:00Z",
          userId: owner,
          workoutId: workout.id,
        },
        {
          finishedAt: "2026-10-01T11:00:00Z",
          planId: plan.id,
          startedAt: "2026-10-01T10:00:00Z",
          userId: owner,
          workoutId: workout.id,
        },
        {
          finishedAt: "2026-10-03T11:00:00Z",
          planId: plan.id,
          startedAt: "2026-10-03T10:00:00Z",
          userId: owner,
          workoutId: workout.id,
        },
        {
          planId: plan.id,
          startedAt: "2026-10-06T10:00:00Z",
          userId: owner,
          workoutId: workout.id,
        },
      ])
      .returning({ id: workoutSessions.id });

    // Inserted out of order, so the history must sort by `order`.
    const [lateSquat, lateBench] = await tx
      .insert(workoutSessionExercises)
      .values([
        { exerciseId: squat.id, order: 2, workoutSessionId: late.id },
        { exerciseId: bench.id, order: 1, workoutSessionId: late.id },
        { exerciseId: bench.id, order: 1, workoutSessionId: middle.id },
      ])
      .returning({ id: workoutSessionExercises.id });
    await tx.insert(workoutSessionExerciseSets).values([
      {
        loggedAt: "2026-10-05T11:30:00Z",
        order: 2,
        repsCompleted: 6,
        repsRecommended: 8,
        restRecommended: 90,
        weightCompleted: "62.50",
        weightRecommended: "62.50",
        workoutSessionExerciseId: lateBench.id,
      },
      {
        loggedAt: "2026-10-05T11:20:00Z",
        order: 1,
        repsCompleted: 8,
        repsRecommended: 8,
        restRecommended: 90,
        weightCompleted: "60.00",
        weightRecommended: "60.00",
        workoutSessionExerciseId: lateBench.id,
      },
      {
        order: 1,
        repsRecommended: 5,
        restRecommended: 180,
        weightRecommended: "100.00",
        workoutSessionExerciseId: lateSquat.id,
      },
    ]);

    return {
      benchId: bench.id,
      lateId: late.id,
      middleId: middle.id,
      oldestId: oldest.id,
      openId: open.id,
      planId: plan.id,
      squatId: squat.id,
      workoutId: workout.id,
    };
  });

beforeAll(async () => {
  seeded = await seedOwner();
  [{ id: intruderSessionId }] = await withService((tx) =>
    tx
      .insert(workoutSessions)
      .values({
        finishedAt: "2026-10-07T11:00:00Z",
        startedAt: "2026-10-07T10:00:00Z",
        userId: intruder,
      })
      .returning({ id: workoutSessions.id })
  );
});

afterAll(async () => {
  await withService(async (tx) => {
    await deleteUserData(tx, owner);
    await deleteUserData(tx, intruder);
    await tx
      .delete(exercises)
      .where(inArray(exercises.id, [seeded.benchId, seeded.squatId]));
  });
});

describe("listWorkoutHistory", () => {
  it("returns finished sessions, last finished first, with exercises and sets in order", async () => {
    const history = await asUser(owner, (tx) =>
      listWorkoutHistory(tx, { limit: 10 })
    );

    expect(history.map((session) => session.id)).toEqual([
      seeded.lateId,
      seeded.middleId,
      seeded.oldestId,
    ]);
    expect(history[0]).toEqual({
      exercises: [
        {
          exercise: { id: seeded.benchId, name: "Test bench" },
          id: expect.any(String),
          order: 1,
          sets: [
            {
              id: expect.any(String),
              logged_at: "2026-10-05T11:20:00+00:00",
              order: 1,
              reps_completed: 8,
              reps_recommended: 8,
              rest_recommended: 90,
              weight_completed: 60,
              weight_recommended: 60,
            },
            expect.objectContaining({
              order: 2,
              reps_completed: 6,
              weight_completed: 62.5,
            }),
          ],
        },
        {
          exercise: { id: seeded.squatId, name: "Test squat" },
          id: expect.any(String),
          order: 2,
          sets: [
            expect.objectContaining({
              logged_at: null,
              order: 1,
              reps_completed: null,
              weight_recommended: 100,
            }),
          ],
        },
      ],
      finished_at: "2026-10-05T12:00:00+00:00",
      id: seeded.lateId,
      plan: { id: seeded.planId, name: "History plan" },
      started_at: "2026-09-30T10:00:00+00:00",
      status: "finished",
      workout: { id: seeded.workoutId, name: "Day A" },
    });
    // a session with no exercises still shows up, with none
    expect(history[2]).toMatchObject({ exercises: [], id: seeded.oldestId });
  });

  it("returns at most `limit` sessions, the latest ones", async () => {
    const history = await asUser(owner, (tx) =>
      listWorkoutHistory(tx, { limit: 2 })
    );

    expect(history.map((session) => session.id)).toEqual([
      seeded.lateId,
      seeded.middleId,
    ]);
  });

  it("never returns another User's sessions", async () => {
    const ownHistory = await asUser(owner, (tx) =>
      listWorkoutHistory(tx, { limit: 20 })
    );
    const intruderHistory = await asUser(intruder, (tx) =>
      listWorkoutHistory(tx, { limit: 20 })
    );

    expect(ownHistory.map((session) => session.id)).not.toContain(
      intruderSessionId
    );
    expect(intruderHistory.map((session) => session.id)).toEqual([
      intruderSessionId,
    ]);
    expect(intruderHistory[0]).toMatchObject({
      exercises: [],
      plan: null,
      workout: null,
    });
  });

  it("leaves out sessions still in progress", async () => {
    const history = await asUser(owner, (tx) =>
      listWorkoutHistory(tx, { limit: 20 })
    );

    expect(history.map((session) => session.id)).not.toContain(seeded.openId);
  });
});
