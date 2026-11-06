import { randomUUID } from "node:crypto";

import {
  asUser,
  plans,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  finishWorkoutSession,
  startWorkoutSession,
} from "../src/workout-sessions";
import { deleteTestUsers } from "./delete-test-users";

/**
 * Starting and finishing Workout Sessions through asUser, against a local Supabase stack via
 * the Supavisor pooler as the fitme login. Made-up Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);

/**
 * A fresh owner per test: a User has at most one open Workout Session, so a
 * test's leftover open session would refuse the next test's start.
 */
const owners: string[] = [];
let owner = "";

const intruder = `user_svcLifeIntruder${runId}`;

/** Another id, as after a rekey that committed while a start was running. */
const elsewhere = `user_svcLifeElsewhere${runId}`;

let templates = 0;

/** A Plan of the owner with Workouts in the given orders, by name. */
const seedPlan = async (
  orders: Record<string, number>,
  { deleted = false, userId = owner } = {}
) =>
  await withService(async (tx) => {
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
const seedTemplate = async (workoutId: string) =>
  await withService(async (tx) => {
    templates += 1;
    const squatSlug = `test-life-squat-${runId}-${templates}`;
    const pressSlug = `test-life-press-${runId}-${templates}`;

    const [squatEntry, pressEntry] = await tx
      .insert(workoutExercises)
      .values([
        { exerciseSlug: squatSlug, order: 1, workoutId },
        { exerciseSlug: pressSlug, order: 2, workoutId },
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

    return { pressSlug, squatSlug };
  });

const sessionsOf = async (workoutId: string) =>
  await withService((tx) =>
    tx
      .select({
        finishedAt: workoutSessions.finishedAt,
        id: workoutSessions.id,
        userId: workoutSessions.userId,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.workoutId, workoutId))
  );

const start = async (workoutId: string, userId = owner) =>
  await asUser(userId, async (tx) => await startWorkoutSession(tx, workoutId));

const startedSessionId = async (workoutId: string, userId = owner) => {
  const result = await start(workoutId, userId);

  if (result.status !== "started") {
    throw new Error(`Expected a session, got ${result.status}`);
  }

  return result.session.id;
};

const closeDirectly = async (sessionId: string) =>
  await withService((tx) =>
    tx
      .update(workoutSessions)
      .set({ finishedAt: "2026-10-01T12:00:00Z" })
      .where(eq(workoutSessions.id, sessionId))
  );

/** An open session of the owner on `workoutId` (or none), started an hour ago. */
const seedOpenSession = async (planId: string, workoutId: string | null) =>
  await withService(async (tx) => {
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

const openSessionsOf = async (userId: string) =>
  await withService((tx) =>
    tx
      .select({ id: workoutSessions.id, workoutId: workoutSessions.workoutId })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          isNull(workoutSessions.finishedAt)
        )
      )
  );

const finish = async (sessionId: string, userId = owner) =>
  await asUser(userId, async (tx) => await finishWorkoutSession(tx, sessionId));

const workoutOrders = async (planId: string) =>
  await withService(async (tx) => {
    const rows = await tx
      .select({ name: workouts.name, order: workouts.order })
      .from(workouts)
      .where(eq(workouts.planId, planId))
      .orderBy(asc(workouts.order));

    return rows.map(({ name, order }) => [name, order]);
  });

const sessionTimes = async (sessionId: string) =>
  await withService(async (tx) => {
    const [row] = await tx
      .select({
        finishedAt: workoutSessions.finishedAt,
        updatedAt: workoutSessions.updatedAt,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));

    return row;
  });

const THREE_DAYS = { W1: 1, W2: 2, W3: 3 };

describe("workout session lifecycle", () => {
  beforeEach(() => {
    owner = `user_svcLifeOwner${runId}${owners.length}`;
    owners.push(owner);
  });

  afterAll(async () => {
    await deleteTestUsers([...owners, intruder, elsewhere]);
  });

  describe("starting Workout Sessions", () => {
    it("copies the Workout's exercises and sets into a new open session", async () => {
      const { planId, workoutIds } = await seedPlan({ "Day A": 1 });
      const workoutId = workoutIds["Day A"];
      const { pressSlug, squatSlug } = await seedTemplate(workoutId);

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
        result.session.exercises.map(({ exercise_slug, order, sets }) => ({
          exerciseSlug: exercise_slug,
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
      ).toStrictEqual([
        {
          exerciseSlug: squatSlug,
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
          exerciseSlug: pressSlug,
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
      await expect(sessionsOf(workoutId)).resolves.toStrictEqual([
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
      expect(second).toStrictEqual({ ...first, resumed: true });
      await expect(sessionsOf(workoutId)).resolves.toHaveLength(1);

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
      expect(ids.has(only.id)).toBeTruthy();
      await expect(sessionsOf(workoutId)).resolves.toHaveLength(1);

      // every start returns the copied exercises, not a half-built session
      expect(
        results.map((result) =>
          result.status === "started" ? result.session.exercises.length : null
        )
      ).toStrictEqual([2, 2, 2]);
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

      expect(open).toStrictEqual([{ id: third.session.id }]);
    });

    it("refuses a Workout of a soft-deleted Plan", async () => {
      const { workoutIds } = await seedPlan({ "Day A": 1 }, { deleted: true });
      const workoutId = workoutIds["Day A"];

      await expect(start(workoutId)).resolves.toStrictEqual({
        status: "not_found",
      });
      await expect(sessionsOf(workoutId)).resolves.toStrictEqual([]);
    });

    it("refuses another User's Workout", async () => {
      const { workoutIds } = await seedPlan({ "Day A": 1 });
      const workoutId = workoutIds["Day A"];

      await expect(start(workoutId, intruder)).resolves.toStrictEqual({
        status: "not_found",
      });
      await expect(sessionsOf(workoutId)).resolves.toStrictEqual([]);
    });

    it("refuses an unknown Workout", async () => {
      await expect(start(randomUUID())).resolves.toStrictEqual({
        status: "not_found",
      });
    });

    it("starts its own session next to an open session owned by another id", async () => {
      const { planId, workoutIds } = await seedPlan({ "Day A": 1 });
      const workoutId = workoutIds["Day A"];
      const elsewhereSessionId: unknown = expect.any(String);
      await withService((tx) =>
        tx.insert(workoutSessions).values({
          planId,
          startedAt: "2026-10-01T10:00:00Z",
          userId: elsewhere,
          workoutId,
        })
      );

      const result = await start(workoutId);

      expect(result).toMatchObject({ resumed: false, status: "started" });
      await expect(sessionsOf(workoutId)).resolves.toStrictEqual(
        expect.arrayContaining([
          { finishedAt: null, id: elsewhereSessionId, userId: elsewhere },
          {
            finishedAt: null,
            id: result.status === "started" ? result.session.id : "",
            userId: owner,
          },
        ])
      );
    });
  });

  describe("startWorkoutSession, one open Workout Session per User", () => {
    it("refuses another Workout while one is open, naming it, with nothing written", async () => {
      const { workoutIds } = await seedPlan({ "Day A": 1, "Day B": 2 });
      await seedTemplate(workoutIds["Day B"]);
      const openId = await startedSessionId(workoutIds["Day A"]);

      await expect(start(workoutIds["Day B"])).resolves.toStrictEqual({
        sessionId: openId,
        status: "session_in_progress",
        workoutName: "Day A",
      });
      await expect(sessionsOf(workoutIds["Day B"])).resolves.toStrictEqual([]);
      await expect(openSessionsOf(owner)).resolves.toStrictEqual([
        { id: openId, workoutId: workoutIds["Day A"] },
      ]);
    });

    it("still resumes the open Workout's own session", async () => {
      const { workoutIds } = await seedPlan({ "Day A": 1, "Day B": 2 });
      const openId = await startedSessionId(workoutIds["Day A"]);
      await start(workoutIds["Day B"]);

      await expect(start(workoutIds["Day A"])).resolves.toMatchObject({
        resumed: true,
        session: { id: openId },
        status: "started",
      });
    });

    it("starts another Workout once the open one is finished", async () => {
      const { workoutIds } = await seedPlan({ "Day A": 1, "Day B": 2 });
      const first = await startedSessionId(workoutIds["Day A"]);
      await asUser(owner, async (tx) => await finishWorkoutSession(tx, first));

      const result = await start(workoutIds["Day B"]);

      expect(result).toMatchObject({
        resumed: false,
        session: { workout: { id: workoutIds["Day B"] } },
        status: "started",
      });
    });

    it("refuses with no Workout name when the open session's Workout is gone", async () => {
      const { planId, workoutIds } = await seedPlan({ "Day A": 1 });
      const orphanId = await seedOpenSession(planId, null);

      await expect(start(workoutIds["Day A"])).resolves.toStrictEqual({
        sessionId: orphanId,
        status: "session_in_progress",
        workoutName: null,
      });
    });

    it("leaves exactly one open session for concurrent starts of different Workouts", async () => {
      const names = ["Day A", "Day B", "Day C"];

      const { workoutIds } = await seedPlan({
        "Day A": 1,
        "Day B": 2,
        "Day C": 3,
      });

      let seeded: Promise<unknown> = Promise.resolve();

      for (const name of names) {
        seeded = seeded.then(async () => await seedTemplate(workoutIds[name]));
      }

      await seeded;

      const results = await Promise.all(
        names.map(async (name) => await start(workoutIds[name]))
      );

      const open = await openSessionsOf(owner);
      expect(open).toHaveLength(1);
      const [winner] = open;
      const started = results.filter((result) => result.status === "started");
      expect(started).toHaveLength(1);
      expect(started[0]).toMatchObject({
        resumed: false,
        session: { id: winner.id },
      });

      const winnerName = names.find(
        (name) => workoutIds[name] === winner.workoutId
      );

      for (const result of results.filter(
        (each) => each.status !== "started"
      )) {
        expect(result).toStrictEqual({
          sessionId: winner.id,
          status: "session_in_progress",
          workoutName: winnerName,
        });
      }

      // the winner's copy is complete, and the losers wrote nothing
      expect(
        started[0].status === "started" && started[0].session.exercises
      ).toHaveLength(2);

      const sessionExercises = await withService((tx) =>
        tx
          .select({ id: workoutSessionExercises.id })
          .from(workoutSessionExercises)
          .innerJoin(
            workoutSessions,
            eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
          )
          .where(eq(workoutSessions.userId, owner))
      );

      expect(sessionExercises).toHaveLength(2);
    });

    it("is never blocked by another User's open session", async () => {
      const { workoutIds: theirs } = await seedPlan(
        { "Day A": 1 },
        { userId: intruder }
      );

      await startedSessionId(theirs["Day A"], intruder);
      const { workoutIds } = await seedPlan({ "Day A": 1 });

      await expect(start(workoutIds["Day A"])).resolves.toMatchObject({
        resumed: false,
        status: "started",
      });
    });
  });

  describe("finishing Workout Sessions", () => {
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
      await expect(workoutOrders(planId)).resolves.toStrictEqual([
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
      await withService(async (tx) => {
        let reordered: Promise<unknown> = Promise.resolve();

        for (const [name, order] of Object.entries(THREE_DAYS)) {
          reordered = reordered.then(
            async () =>
              await tx
                .update(workouts)
                .set({ order })
                .where(eq(workouts.id, workoutIds[name]))
          );
        }

        await reordered;
      });
      const before = await sessionTimes(sessionId);

      const result = await finish(sessionId);

      expect(result).toMatchObject({
        alreadyFinished: true,
        rotated: false,
        session: { id: sessionId, status: "finished" },
        status: "finished",
      });
      await expect(sessionTimes(sessionId)).resolves.toStrictEqual(before);
      await expect(workoutOrders(planId)).resolves.toStrictEqual([
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
      await expect(workoutOrders(planId)).resolves.toStrictEqual([
        ["W2", 2],
        ["W3", 3],
      ]);
    });

    it("finishes a session that never had a Workout without rotating", async () => {
      const { planId } = await seedPlan(THREE_DAYS);
      const sessionId = await seedOpenSession(planId, null);

      await expect(finish(sessionId)).resolves.toMatchObject({
        alreadyFinished: false,
        rotated: false,
        status: "finished",
      });
      const times = await sessionTimes(sessionId);
      expect(times.finishedAt).not.toBeNull();
      await expect(workoutOrders(planId)).resolves.toStrictEqual([
        ["W1", 1],
        ["W2", 2],
        ["W3", 3],
      ]);
    });

    it("refuses another User's session", async () => {
      const { planId, workoutIds } = await seedPlan(THREE_DAYS);
      const sessionId = await seedOpenSession(planId, workoutIds.W2);

      await expect(finish(sessionId, intruder)).resolves.toStrictEqual({
        status: "not_found",
      });
      const times = await sessionTimes(sessionId);
      expect(times.finishedAt).toBeNull();
      await expect(workoutOrders(planId)).resolves.toStrictEqual([
        ["W1", 1],
        ["W2", 2],
        ["W3", 3],
      ]);
    });

    it("refuses an unknown session", async () => {
      await expect(finish(randomUUID())).resolves.toStrictEqual({
        status: "not_found",
      });
    });

    it("renumbers a Plan with gaps in its Workout order from 1", async () => {
      const { planId, workoutIds } = await seedPlan({ X1: 1, X2: 5, X3: 9 });
      const sessionId = await seedOpenSession(planId, workoutIds.X2);

      await expect(finish(sessionId)).resolves.toMatchObject({ rotated: true });
      await expect(workoutOrders(planId)).resolves.toStrictEqual([
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

      await expect(finish(first)).resolves.toMatchObject({ rotated: true });
      const second = await start(workoutId);

      expect(second).toMatchObject({ resumed: false, status: "started" });
      expect(second.status === "started" && second.session.id).not.toBe(first);
    });

    it("serializes concurrent finishes of one session, rotating once", async () => {
      const { planId, workoutIds } = await seedPlan(THREE_DAYS);
      const sessionId = await seedOpenSession(planId, workoutIds.W1);

      const results = await Promise.all([finish(sessionId), finish(sessionId)]);

      expect(
        results
          .map((result) => "rotated" in result && result.rotated)
          .toSorted((left, right) => Number(left) - Number(right))
      ).toStrictEqual([false, true]);
      await expect(workoutOrders(planId)).resolves.toStrictEqual([
        ["W2", 1],
        ["W3", 2],
        ["W1", 3],
      ]);
    });
  });
});
