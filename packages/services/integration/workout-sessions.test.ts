import { randomUUID } from "node:crypto";
import {
  asUser,
  exercises,
  plans,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteUserData } from "../src/delete-user-data";
import {
  deleteWorkoutSession,
  getWorkoutSession,
  listWorkoutSessions,
  logSet,
} from "../src/workout-sessions";

/**
 * The Workout Session services through asUser, against a local Supabase stack
 * via the Supavisor pooler as the fitme login. Made-up Clerk-style User ids,
 * unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcSessOwner${runId}`;
const intruder = `user_svcSessIntruder${runId}`;

/** How PostgREST rendered timestamps, e.g. 2026-10-01T10:00:00.123+00:00. */
const POSTGREST_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?\+00:00$/;

interface Seeded {
  benchId: string;
  finishedSessionId: string;
  finishedSetId: string;
  openSessionId: string;
  /** The open session's sets: bench 1, bench 2, squat 1. */
  openSetIds: [string, string, string];
  planId: string;
  planSetId: string;
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
        { name: "Test bench", slug: `test-sess-bench-${runId}` },
        { name: "Test squat", slug: `test-sess-squat-${runId}` },
      ])
      .returning({ id: exercises.id });
    const [plan] = await tx
      .insert(plans)
      .values({
        frequency: 3,
        goal: "general",
        name: "Sessions plan",
        place: "gym",
        userId: owner,
      })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({ description: "A", name: "Day A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });
    const [planExercise] = await tx
      .insert(workoutExercises)
      .values({ exerciseId: bench.id, order: 1, workoutId: workout.id })
      .returning({ id: workoutExercises.id });
    const [planSet] = await tx
      .insert(workoutExerciseSets)
      .values({
        order: 1,
        repsRecommended: 8,
        restRecommended: 90,
        weightRecommended: "60",
        workoutExerciseId: planExercise.id,
      })
      .returning({ id: workoutExerciseSets.id });

    const [finished, open] = await tx
      .insert(workoutSessions)
      .values([
        {
          finishedAt: "2026-10-01T11:00:00Z",
          planId: plan.id,
          startedAt: "2026-10-01T10:00:00Z",
          userId: owner,
          workoutId: workout.id,
        },
        {
          planId: plan.id,
          startedAt: "2026-10-02T10:00:00.123456Z",
          userId: owner,
          workoutId: workout.id,
        },
      ])
      .returning({ id: workoutSessions.id });

    // Inserted out of order, so reads must sort by `order`.
    const [openSquat, openBench, finishedBench] = await tx
      .insert(workoutSessionExercises)
      .values([
        { exerciseId: squat.id, order: 2, workoutSessionId: open.id },
        { exerciseId: bench.id, order: 1, workoutSessionId: open.id },
        { exerciseId: bench.id, order: 1, workoutSessionId: finished.id },
      ])
      .returning({ id: workoutSessionExercises.id });
    const [squatSet, benchSet2, benchSet1, finishedSet] = await tx
      .insert(workoutSessionExerciseSets)
      .values([
        {
          order: 1,
          repsRecommended: 5,
          restRecommended: 120,
          weightRecommended: "100.00",
          workoutSessionExerciseId: openSquat.id,
        },
        {
          order: 2,
          repsRecommended: 8,
          restRecommended: 90,
          weightRecommended: "62.50",
          workoutSessionExerciseId: openBench.id,
        },
        {
          order: 1,
          repsRecommended: 8,
          restRecommended: 90,
          weightRecommended: "62.50",
          workoutSessionExerciseId: openBench.id,
        },
        {
          loggedAt: "2026-10-01T10:30:00Z",
          order: 1,
          repsCompleted: 8,
          repsRecommended: 8,
          weightCompleted: "60.00",
          weightRecommended: "60.00",
          workoutSessionExerciseId: finishedBench.id,
        },
      ])
      .returning({ id: workoutSessionExerciseSets.id });

    return {
      benchId: bench.id,
      finishedSessionId: finished.id,
      finishedSetId: finishedSet.id,
      openSessionId: open.id,
      openSetIds: [benchSet1.id, benchSet2.id, squatSet.id],
      planId: plan.id,
      planSetId: planSet.id,
      squatId: squat.id,
      workoutId: workout.id,
    };
  });

const setRow = (setId: string) =>
  withService(async (tx) => {
    const [row] = await tx
      .select()
      .from(workoutSessionExerciseSets)
      .where(eq(workoutSessionExerciseSets.id, setId));
    return row;
  });

const sessionExists = (sessionId: string) =>
  withService(async (tx) => {
    const rows = await tx
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));
    return rows.length > 0;
  });

beforeAll(async () => {
  seeded = await seedOwner();
  [{ id: intruderSessionId }] = await withService((tx) =>
    tx
      .insert(workoutSessions)
      .values({ startedAt: "2026-10-03T10:00:00Z", userId: intruder })
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

describe("listWorkoutSessions", () => {
  it("lists the User's sessions newest first with set counts", async () => {
    const page = await asUser(owner, (tx) =>
      listWorkoutSessions(tx, { limit: 20, offset: 0, status: "all" })
    );

    expect(page.total).toBe(2);
    expect(page.sessions).toEqual([
      {
        exercise_count: 2,
        finished_at: null,
        id: seeded.openSessionId,
        logged_set_count: 0,
        plan: { id: seeded.planId, name: "Sessions plan" },
        set_count: 3,
        started_at: expect.stringMatching(POSTGREST_TIMESTAMP),
        status: "in_progress",
        workout: { id: seeded.workoutId, name: "Day A" },
      },
      {
        exercise_count: 1,
        finished_at: "2026-10-01T11:00:00+00:00",
        id: seeded.finishedSessionId,
        logged_set_count: 1,
        plan: { id: seeded.planId, name: "Sessions plan" },
        set_count: 1,
        started_at: "2026-10-01T10:00:00+00:00",
        status: "finished",
        workout: { id: seeded.workoutId, name: "Day A" },
      },
    ]);
  });

  it("filters by status", async () => {
    const [open, finished] = await asUser(owner, async (tx) => [
      await listWorkoutSessions(tx, {
        limit: 20,
        offset: 0,
        status: "in_progress",
      }),
      await listWorkoutSessions(tx, {
        limit: 20,
        offset: 0,
        status: "finished",
      }),
    ]);

    expect(open.sessions.map((session) => session.id)).toEqual([
      seeded.openSessionId,
    ]);
    expect(open.total).toBe(1);
    expect(finished.sessions.map((session) => session.id)).toEqual([
      seeded.finishedSessionId,
    ]);
    expect(finished.total).toBe(1);
  });

  it("pages, and returns an empty page past the end with the total", async () => {
    const [second, pastEnd] = await asUser(owner, async (tx) => [
      await listWorkoutSessions(tx, { limit: 1, offset: 1, status: "all" }),
      await listWorkoutSessions(tx, { limit: 10, offset: 5, status: "all" }),
    ]);

    expect(second.sessions.map((session) => session.id)).toEqual([
      seeded.finishedSessionId,
    ]);
    expect(second.total).toBe(2);
    expect(pastEnd).toEqual({ sessions: [], total: 2 });
  });

  it("never lists another User's sessions", async () => {
    const page = await asUser(intruder, (tx) =>
      listWorkoutSessions(tx, { limit: 20, offset: 0, status: "all" })
    );

    expect(page).toEqual({
      sessions: [
        expect.objectContaining({
          id: intruderSessionId,
          plan: null,
          workout: null,
        }),
      ],
      total: 1,
    });
  });
});

describe("getWorkoutSession", () => {
  it("returns the session with its exercises and sets in order", async () => {
    const session = await asUser(owner, (tx) =>
      getWorkoutSession(tx, seeded.openSessionId)
    );

    expect(session).toEqual({
      exercises: [
        {
          exercise: { id: seeded.benchId, name: "Test bench" },
          exercise_slug: `test-sess-bench-${runId}`,
          id: expect.any(String),
          order: 1,
          sets: [
            {
              id: seeded.openSetIds[0],
              logged_at: null,
              order: 1,
              reps_completed: null,
              reps_recommended: 8,
              rest_recommended: 90,
              weight_completed: null,
              weight_recommended: 62.5,
            },
            expect.objectContaining({ id: seeded.openSetIds[1], order: 2 }),
          ],
        },
        {
          exercise: { id: seeded.squatId, name: "Test squat" },
          exercise_slug: `test-sess-squat-${runId}`,
          id: expect.any(String),
          order: 2,
          sets: [
            expect.objectContaining({
              id: seeded.openSetIds[2],
              weight_recommended: 100,
            }),
          ],
        },
      ],
      finished_at: null,
      id: seeded.openSessionId,
      plan: { id: seeded.planId, name: "Sessions plan" },
      started_at: "2026-10-02T10:00:00.123456+00:00",
      status: "in_progress",
      workout: { id: seeded.workoutId, name: "Day A" },
    });
  });

  it("returns a finished session with its logged sets", async () => {
    const session = await asUser(owner, (tx) =>
      getWorkoutSession(tx, seeded.finishedSessionId)
    );

    expect(session).toMatchObject({
      finished_at: "2026-10-01T11:00:00+00:00",
      status: "finished",
    });
    expect(session?.exercises[0]?.sets).toEqual([
      expect.objectContaining({
        logged_at: "2026-10-01T10:30:00+00:00",
        reps_completed: 8,
        weight_completed: 60,
      }),
    ]);
  });

  it("returns null for another User's session or an unknown id", async () => {
    const [foreign, unknown] = await asUser(intruder, async (tx) => [
      await getWorkoutSession(tx, seeded.openSessionId),
      await getWorkoutSession(tx, randomUUID()),
    ]);

    expect(foreign).toBeNull();
    expect(unknown).toBeNull();
  });
});

describe("logSet", () => {
  it("logs a set in the User's open session and overwrites it when logged again", async () => {
    const [setId] = seeded.openSetIds;
    await asUser(owner, (tx) =>
      logSet(tx, { repsCompleted: 5, setId, weightCompleted: 50 })
    );
    const result = await asUser(owner, (tx) =>
      logSet(tx, { repsCompleted: 7, setId, weightCompleted: 62.5 })
    );

    expect(result).toEqual({
      set: {
        id: setId,
        logged_at: expect.stringMatching(POSTGREST_TIMESTAMP),
        order: 1,
        reps_completed: 7,
        reps_recommended: 8,
        rest_recommended: 90,
        weight_completed: 62.5,
        weight_recommended: 62.5,
      },
      status: "logged",
    });
    expect(await setRow(setId)).toMatchObject({
      repsCompleted: 7,
      weightCompleted: "62.50",
    });
  });

  it("leaves a set of a finished session as it was", async () => {
    const result = await asUser(owner, (tx) =>
      logSet(tx, {
        repsCompleted: 1,
        setId: seeded.finishedSetId,
        weightCompleted: 1,
      })
    );

    expect(result).toEqual({
      finishedAt: "2026-10-01T11:00:00+00:00",
      sessionId: seeded.finishedSessionId,
      status: "session_finished",
    });
    expect(await setRow(seeded.finishedSetId)).toMatchObject({
      repsCompleted: 8,
      weightCompleted: "60.00",
    });
  });

  it("finds no set for a plan set id or an unknown id", async () => {
    const [planSet, unknown] = await asUser(owner, async (tx) => [
      await logSet(tx, {
        repsCompleted: 1,
        setId: seeded.planSetId,
        weightCompleted: 1,
      }),
      await logSet(tx, {
        repsCompleted: 1,
        setId: randomUUID(),
        weightCompleted: 1,
      }),
    ]);

    expect(planSet).toEqual({ status: "not_found" });
    expect(unknown).toEqual({ status: "not_found" });
  });

  it("never writes another User's set", async () => {
    const [, setId] = seeded.openSetIds;
    const result = await asUser(intruder, (tx) =>
      logSet(tx, { repsCompleted: 99, setId, weightCompleted: 999 })
    );

    expect(result).toEqual({ status: "not_found" });
    expect(await setRow(setId)).toMatchObject({
      loggedAt: null,
      repsCompleted: null,
      weightCompleted: null,
    });
  });
});

describe("deleteWorkoutSession", () => {
  it("never deletes another User's session", async () => {
    expect(
      await asUser(intruder, (tx) =>
        deleteWorkoutSession(tx, seeded.finishedSessionId)
      )
    ).toBe(false);
    expect(await sessionExists(seeded.finishedSessionId)).toBe(true);
  });

  it("deletes the User's session with its sets, then finds nothing", async () => {
    expect(
      await asUser(owner, (tx) =>
        deleteWorkoutSession(tx, seeded.finishedSessionId)
      )
    ).toBe(true);
    expect(await sessionExists(seeded.finishedSessionId)).toBe(false);
    expect(await setRow(seeded.finishedSetId)).toBeUndefined();

    expect(
      await asUser(owner, (tx) =>
        deleteWorkoutSession(tx, seeded.finishedSessionId)
      )
    ).toBe(false);
  });
});
