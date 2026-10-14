import { randomUUID } from "node:crypto";
import {
  asUser,
  exercises,
  plans,
  type Transaction,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { deleteUserData } from "../src/delete-user-data";
import {
  finishWorkoutSession,
  startWorkoutSession,
} from "../src/workout-sessions";

/**
 * Starting and finishing Workout Sessions through asUser, against a local Supabase stack via
 * the Supavisor pooler as the fitme login: the cases the
 * start_workout_session and finish_workout_session pgTAP suites cover. Made-up Clerk-style User ids,
 * unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcLifeOwner${runId}`;
const intruder = `user_svcLifeIntruder${runId}`;
/** Another id, as after a rekey that committed while a start was running. */
const elsewhere = `user_svcLifeElsewhere${runId}`;

const exerciseIds: string[] = [];

const insertExercises = async (tx: Transaction) => {
  const suffix = `${runId}-${exerciseIds.length}`;
  const rows = await tx
    .insert(exercises)
    .values([
      { name: "Test squat", slug: `test-life-squat-${suffix}` },
      { name: "Test press", slug: `test-life-press-${suffix}` },
    ])
    .returning({ id: exercises.id });
  exerciseIds.push(...rows.map(({ id }) => id));
  return rows;
};

/** A Plan of the owner with Workouts in the given orders, by name. */
const seedPlan = (
  orders: Record<string, number>,
  { deleted = false, userId = owner } = {}
) =>
  withService(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        deletedAt: deleted ? "2026-10-01T00:00:00Z" : null,
        frequency: 3,
        goal: "strength",
        name: "Lifecycle plan",
        place: "gym",
        userId,
      })
      .returning({ id: plans.id });
    const rows = await tx
      .insert(workouts)
      .values(
        Object.entries(orders).map(([name, order]) => ({
          description: name,
          name,
          order,
          planId: plan.id,
        }))
      )
      .returning({ id: workouts.id, name: workouts.name });
    const workoutIds = Object.fromEntries(
      rows.map((row) => [row.name, row.id])
    );
    return { planId: plan.id, workoutIds };
  });

/** Gives a Workout two exercises: squat with 2 sets, press with 1. */
const seedTemplate = (workoutId: string) =>
  withService(async (tx) => {
    const [squat, press] = await insertExercises(tx);
    const [squatEntry, pressEntry] = await tx
      .insert(workoutExercises)
      .values([
        { exerciseId: squat.id, order: 1, workoutId },
        { exerciseId: press.id, order: 2, workoutId },
      ])
      .returning({ id: workoutExercises.id });
    await tx.insert(workoutExerciseSets).values([
      {
        order: 1,
        repsRecommended: 5,
        restRecommended: 120,
        weightRecommended: "100",
        workoutExerciseId: squatEntry.id,
      },
      {
        order: 2,
        repsRecommended: 5,
        restRecommended: 120,
        weightRecommended: "100",
        workoutExerciseId: squatEntry.id,
      },
      {
        order: 1,
        repsRecommended: 8,
        restRecommended: 90,
        weightRecommended: "60",
        workoutExerciseId: pressEntry.id,
      },
    ]);
    return { pressId: press.id, squatId: squat.id };
  });

const sessionsOf = (workoutId: string) =>
  withService((tx) =>
    tx
      .select({
        finishedAt: workoutSessions.finishedAt,
        id: workoutSessions.id,
        userId: workoutSessions.userId,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.workoutId, workoutId))
  );

const start = (workoutId: string, userId = owner) =>
  asUser(userId, (tx) => startWorkoutSession(tx, workoutId));

const startedSessionId = async (workoutId: string, userId = owner) => {
  const result = await start(workoutId, userId);
  if (result.status !== "started") {
    throw new Error(`Expected a session, got ${result.status}`);
  }
  return result.session.id;
};

const closeDirectly = (sessionId: string) =>
  withService((tx) =>
    tx
      .update(workoutSessions)
      .set({ finishedAt: "2026-10-01T12:00:00Z" })
      .where(eq(workoutSessions.id, sessionId))
  );

afterAll(async () => {
  await withService(async (tx) => {
    await deleteUserData(tx, owner);
    await deleteUserData(tx, intruder);
    await deleteUserData(tx, elsewhere);
    if (exerciseIds.length > 0) {
      await tx.delete(exercises).where(inArray(exercises.id, exerciseIds));
    }
  });
});

describe("startWorkoutSession", () => {
  it("copies the Workout's exercises and sets into a new open session", async () => {
    const { planId, workoutIds } = await seedPlan({ "Day A": 1 });
    const workoutId = workoutIds["Day A"];
    const { pressId, squatId } = await seedTemplate(workoutId);

    const result = await start(workoutId);

    expect(result).toMatchObject({
      resumed: false,
      session: {
        finished_at: null,
        plan: { id: planId, name: "Lifecycle plan" },
        status: "in_progress",
        workout: { id: workoutId, name: "Day A" },
      },
      status: "started",
    });
    if (result.status !== "started") {
      return;
    }
    expect(
      result.session.exercises.map(({ exercise, order, sets }) => ({
        exerciseId: exercise.id,
        order,
        sets: sets.map((set) => ({
          logged_at: set.logged_at,
          order: set.order,
          reps_completed: set.reps_completed,
          reps_recommended: set.reps_recommended,
          rest_recommended: set.rest_recommended,
          weight_completed: set.weight_completed,
          weight_recommended: set.weight_recommended,
        })),
      }))
    ).toEqual([
      {
        exerciseId: squatId,
        order: 1,
        sets: [1, 2].map((order) => ({
          logged_at: null,
          order,
          reps_completed: null,
          reps_recommended: 5,
          rest_recommended: 120,
          weight_completed: null,
          weight_recommended: 100,
        })),
      },
      {
        exerciseId: pressId,
        order: 2,
        sets: [
          {
            logged_at: null,
            order: 1,
            reps_completed: null,
            reps_recommended: 8,
            rest_recommended: 90,
            weight_completed: null,
            weight_recommended: 60,
          },
        ],
      },
    ]);
    expect(await sessionsOf(workoutId)).toEqual([
      { finishedAt: null, id: result.session.id, userId: owner },
    ]);
  });

  it("resumes the open session instead of starting another", async () => {
    const { workoutIds } = await seedPlan({ "Day A": 1 });
    const workoutId = workoutIds["Day A"];
    await seedTemplate(workoutId);

    const first = await start(workoutId);
    const second = await start(workoutId);

    expect(first).toMatchObject({ resumed: false, status: "started" });
    expect(second).toEqual({ ...first, resumed: true });
    expect(await sessionsOf(workoutId)).toHaveLength(1);
    const sessionExercises = await withService((tx) =>
      tx
        .select({ id: workoutSessionExercises.id })
        .from(workoutSessionExercises)
        .innerJoin(
          workoutSessions,
          eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
        )
        .where(eq(workoutSessions.workoutId, workoutId))
    );
    expect(sessionExercises).toHaveLength(2);
    const sessionSets = await withService((tx) =>
      tx
        .select({ id: workoutSessionExerciseSets.id })
        .from(workoutSessionExerciseSets)
        .where(
          inArray(
            workoutSessionExerciseSets.workoutSessionExerciseId,
            sessionExercises.map(({ id }) => id)
          )
        )
    );
    expect(sessionSets).toHaveLength(3);
  });

  it("never creates two open sessions for concurrent starts", async () => {
    const { workoutIds } = await seedPlan({ "Day A": 1 });
    const workoutId = workoutIds["Day A"];
    await seedTemplate(workoutId);

    const results = await Promise.all([
      start(workoutId),
      start(workoutId),
      start(workoutId),
    ]);

    const ids = new Set(
      results.map((result) =>
        result.status === "started" ? result.session.id : result.status
      )
    );
    expect(ids.size).toBe(1);
    expect(
      results.filter((result) => "resumed" in result && !result.resumed)
    ).toHaveLength(1);
    const [only] = await sessionsOf(workoutId);
    expect(ids.has(only.id)).toBe(true);
    expect(await sessionsOf(workoutId)).toHaveLength(1);
    // every start returns the copied exercises, not a half-built session
    for (const result of results) {
      expect(
        result.status === "started" && result.session.exercises
      ).toHaveLength(2);
    }
  });

  it("starts a fresh session once the open one is finished or closed directly", async () => {
    const { workoutIds } = await seedPlan({ "Day A": 1 });
    const workoutId = workoutIds["Day A"];
    await seedTemplate(workoutId);

    const first = await startedSessionId(workoutId);
    await closeDirectly(first);
    const second = await startedSessionId(workoutId);
    await closeDirectly(second);
    const third = await start(workoutId);

    expect(second).not.toBe(first);
    expect(third).toMatchObject({ resumed: false, status: "started" });
    if (third.status !== "started") {
      return;
    }
    expect([first, second]).not.toContain(third.session.id);
    expect(third.session.exercises).toHaveLength(2);
    const open = await withService((tx) =>
      tx
        .select({ id: workoutSessions.id })
        .from(workoutSessions)
        .where(
          and(
            eq(workoutSessions.workoutId, workoutId),
            isNull(workoutSessions.finishedAt)
          )
        )
    );
    expect(open).toEqual([{ id: third.session.id }]);
  });

  it("refuses a Workout of a soft-deleted Plan", async () => {
    const { workoutIds } = await seedPlan({ "Day A": 1 }, { deleted: true });
    const workoutId = workoutIds["Day A"];

    expect(await start(workoutId)).toEqual({ status: "not_found" });
    expect(await sessionsOf(workoutId)).toEqual([]);
  });

  it("refuses another User's Workout", async () => {
    const { workoutIds } = await seedPlan({ "Day A": 1 });
    const workoutId = workoutIds["Day A"];

    expect(await start(workoutId, intruder)).toEqual({ status: "not_found" });
    expect(await sessionsOf(workoutId)).toEqual([]);
  });

  it("refuses an unknown Workout", async () => {
    expect(await start(randomUUID())).toEqual({ status: "not_found" });
  });

  it("doesn't resume an open session owned by another id", async () => {
    const { planId, workoutIds } = await seedPlan({ "Day A": 1 });
    const workoutId = workoutIds["Day A"];
    await withService((tx) =>
      tx.insert(workoutSessions).values({
        planId,
        startedAt: "2026-10-01T10:00:00Z",
        userId: elsewhere,
        workoutId,
      })
    );

    expect(await start(workoutId)).toEqual({ status: "not_found" });
    expect(await sessionsOf(workoutId)).toEqual([
      { finishedAt: null, id: expect.any(String), userId: elsewhere },
    ]);
  });
});

const finish = (sessionId: string, userId = owner) =>
  asUser(userId, (tx) => finishWorkoutSession(tx, sessionId));

const workoutOrders = (planId: string) =>
  withService(async (tx) => {
    const rows = await tx
      .select({ name: workouts.name, order: workouts.order })
      .from(workouts)
      .where(eq(workouts.planId, planId))
      .orderBy(asc(workouts.order));
    return rows.map(({ name, order }) => [name, order]);
  });

const sessionTimes = (sessionId: string) =>
  withService(async (tx) => {
    const [row] = await tx
      .select({
        finishedAt: workoutSessions.finishedAt,
        updatedAt: workoutSessions.updatedAt,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));
    return row;
  });

/** An open session of the owner on `workoutId` (or none), started an hour ago. */
const seedOpenSession = (planId: string, workoutId: string | null) =>
  withService(async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        createdAt: "2026-10-01T10:00:00Z",
        planId,
        startedAt: "2026-10-01T10:00:00Z",
        updatedAt: "2026-10-01T10:00:00Z",
        userId: owner,
        workoutId,
      })
      .returning({ id: workoutSessions.id });
    return session.id;
  });

const THREE_DAYS = { W1: 1, W2: 2, W3: 3 };

describe("finishWorkoutSession", () => {
  it("finishes an open session and moves its Workout to the end of the Plan", async () => {
    const { planId, workoutIds } = await seedPlan(THREE_DAYS);
    const sessionId = await seedOpenSession(planId, workoutIds.W1);

    const result = await finish(sessionId);

    expect(result).toMatchObject({
      alreadyFinished: false,
      rotated: true,
      session: { id: sessionId, status: "finished" },
      status: "finished",
    });
    const times = await sessionTimes(sessionId);
    expect(times.finishedAt).not.toBeNull();
    expect(times.updatedAt).toBe(times.finishedAt);
    expect(await workoutOrders(planId)).toEqual([
      ["W2", 1],
      ["W3", 2],
      ["W1", 3],
    ]);
  });

  it("changes nothing when called again", async () => {
    const { planId, workoutIds } = await seedPlan(THREE_DAYS);
    const sessionId = await seedOpenSession(planId, workoutIds.W1);
    await finish(sessionId);
    // Put W1 back first so a second rotation would be visible.
    await withService((tx) =>
      Promise.all(
        Object.entries(THREE_DAYS).map(([name, order]) =>
          tx
            .update(workouts)
            .set({ order })
            .where(eq(workouts.id, workoutIds[name]))
        )
      )
    );
    const before = await sessionTimes(sessionId);

    const result = await finish(sessionId);

    expect(result).toMatchObject({
      alreadyFinished: true,
      rotated: false,
      session: { id: sessionId, status: "finished" },
      status: "finished",
    });
    expect(await sessionTimes(sessionId)).toEqual(before);
    expect(await workoutOrders(planId)).toEqual([
      ["W1", 1],
      ["W2", 2],
      ["W3", 3],
    ]);
  });

  it("finishes without rotating when the session's Workout was removed", async () => {
    const { planId, workoutIds } = await seedPlan(THREE_DAYS);
    const sessionId = await seedOpenSession(planId, workoutIds.W1);
    // As update_plan does when it replaces the Workouts
    await withService((tx) =>
      tx.delete(workouts).where(eq(workouts.id, workoutIds.W1))
    );

    const result = await finish(sessionId);

    expect(result).toMatchObject({
      alreadyFinished: false,
      rotated: false,
      session: { id: sessionId, status: "finished", workout: null },
      status: "finished",
    });
    expect(await workoutOrders(planId)).toEqual([
      ["W2", 2],
      ["W3", 3],
    ]);
  });

  it("finishes a session that never had a Workout without rotating", async () => {
    const { planId } = await seedPlan(THREE_DAYS);
    const sessionId = await seedOpenSession(planId, null);

    expect(await finish(sessionId)).toMatchObject({
      alreadyFinished: false,
      rotated: false,
      status: "finished",
    });
    expect((await sessionTimes(sessionId)).finishedAt).not.toBeNull();
    expect(await workoutOrders(planId)).toEqual([
      ["W1", 1],
      ["W2", 2],
      ["W3", 3],
    ]);
  });

  it("refuses another User's session", async () => {
    const { planId, workoutIds } = await seedPlan(THREE_DAYS);
    const sessionId = await seedOpenSession(planId, workoutIds.W2);

    expect(await finish(sessionId, intruder)).toEqual({ status: "not_found" });
    expect((await sessionTimes(sessionId)).finishedAt).toBeNull();
    expect(await workoutOrders(planId)).toEqual([
      ["W1", 1],
      ["W2", 2],
      ["W3", 3],
    ]);
  });

  it("refuses an unknown session", async () => {
    expect(await finish(randomUUID())).toEqual({ status: "not_found" });
  });

  it("renumbers a Plan with gaps in its Workout order from 1", async () => {
    const { planId, workoutIds } = await seedPlan({ X1: 1, X2: 5, X3: 9 });
    const sessionId = await seedOpenSession(planId, workoutIds.X2);

    expect(await finish(sessionId)).toMatchObject({ rotated: true });
    expect(await workoutOrders(planId)).toEqual([
      ["X1", 1],
      ["X3", 2],
      ["X2", 3],
    ]);
  });

  it("lets a started session be finished and a fresh one started", async () => {
    const { workoutIds } = await seedPlan({ "Day A": 1 });
    const workoutId = workoutIds["Day A"];
    await seedTemplate(workoutId);
    const first = await startedSessionId(workoutId);

    expect(await finish(first)).toMatchObject({ rotated: true });
    const second = await start(workoutId);

    expect(second).toMatchObject({ resumed: false, status: "started" });
    expect(second.status === "started" && second.session.id).not.toBe(first);
  });

  it("serializes concurrent finishes of one Plan's sessions", async () => {
    const { planId, workoutIds } = await seedPlan(THREE_DAYS);
    const sessionIds = await Promise.all(
      ["W1", "W2"].map((name) => seedOpenSession(planId, workoutIds[name]))
    );

    const results = await Promise.all(sessionIds.map((id) => finish(id)));

    for (const result of results) {
      expect(result).toMatchObject({ rotated: true });
    }
    const orders = await workoutOrders(planId);
    expect(orders[0]).toEqual(["W3", 1]);
    expect(orders.map(([, order]) => order)).toEqual([1, 2, 3]);
  });
});
