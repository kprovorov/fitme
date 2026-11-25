import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

import {
  asUser,
  personalRecords,
  plans,
  profiles,
  weeklyGoalChanges,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import type { Transaction } from "@fitme/db";
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deleteUserData } from "../src/delete-user-data";
import { getLifetimeTotals } from "../src/lifetime-totals";
import { updateProfile } from "../src/profile";
import { listWeeklyGoalChanges } from "../src/weekly-goals";
import {
  deleteWorkoutSession,
  finishForgottenWorkoutSession,
  finishWorkoutSession,
  listWorkoutSessions,
  logSet,
  removeSetFromWorkoutSession,
} from "../src/workout-sessions";
import type {
  FinishWorkoutSessionResult,
  LogSetResult,
} from "../src/workout-sessions";
import { deleteTestUsers, withUserTablesLocked } from "./delete-test-users";

/**
 * Finishing Forgotten Workout Sessions (ADR 0024) through withService, against
 * a local Supabase stack via the Supavisor pooler as the fitme login, with
 * service_role's real grants. Made-up Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const users: string[] = [];
let owner = "";

const newUser = () => {
  const userId = `user_svcForgot${runId}${users.length}`;
  users.push(userId);

  return userId;
};

const SQUAT = "barbell-back-squat";
const STARTED_AT = "2026-11-10T10:00:00Z";
const LAST_LOGGED_AT = "2026-11-10T10:41:12.345678+00:00";
const LEFT_ALONE = { status: "left_alone" };

/** A set to seed; unlogged when `loggedAt` is `null`. */
interface SeedSet {
  loggedAt: string | null | ReturnType<typeof sql>;
  reps?: number | null;
  weight?: string | null;
}

const LOGGED: SeedSet[] = [
  { loggedAt: "2026-11-10T10:20:00Z" },
  { loggedAt: LAST_LOGGED_AT },
];

const ago = (interval: string) => sql`now() - ${interval}::interval`;

/** An active Plan of the User with Workouts W1 and W2. */
const seedPlan = async (userId = owner) =>
  await withService(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        frequency: 3,
        goal: "strength",
        isActive: true,
        name: "Plan",
        place: "gym",
        userId,
      })
      .returning({ id: plans.id });

    const [first] = await tx
      .insert(workouts)
      .values(
        ["W1", "W2"].map((name, index) => ({
          description: name,
          name,
          order: index + 1,
          planId: plan.id,
        }))
      )
      .returning({ id: workouts.id });

    return { planId: plan.id, workoutId: first.id };
  });

interface SessionSeed {
  finishedAt?: string | null;
  planId?: string | null;
  sets?: SeedSet[];
  startedAt?: string;
  userId?: string;
  workoutId?: string | null;
}

/** A Workout Session with one Exercise; `sets` in order, 100 × 5 by default. */
const seedSessionIn = async (
  tx: Transaction,
  {
    finishedAt = null,
    planId = null,
    sets = LOGGED,
    startedAt = STARTED_AT,
    userId = owner,
    workoutId = null,
  }: SessionSeed = {}
) => {
  const [session] = await tx
    .insert(workoutSessions)
    .values({ finishedAt, planId, startedAt, userId, workoutId })
    .returning({ id: workoutSessions.id });

  const [exercise] = await tx
    .insert(workoutSessionExercises)
    .values({ exerciseSlug: SQUAT, order: 1, workoutSessionId: session.id })
    .returning({ id: workoutSessionExercises.id });

  if (sets.length === 0) {
    return { sessionId: session.id, setIds: [] };
  }

  const rows = await tx
    .insert(workoutSessionExerciseSets)
    .values(
      sets.map(({ loggedAt, reps = 5, weight = "100" }, index) => ({
        loggedAt,
        order: index + 1,
        repsCompleted: loggedAt === null ? null : reps,
        weightCompleted: loggedAt === null ? null : weight,
        workoutSessionExerciseId: exercise.id,
      }))
    )
    .returning({ id: workoutSessionExerciseSets.id });

  return { sessionId: session.id, setIds: rows.map(({ id }) => id) };
};

const seedSession = async (seed?: SessionSeed) =>
  await withService(async (tx) => await seedSessionIn(tx, seed));

/** An hour's finished Workout Session, 90 × 5, for the next one to beat. */
const seedEarlierSession = async (userId = owner) =>
  await seedSession({
    finishedAt: "2026-11-01T11:00:00Z",
    sets: [{ loggedAt: "2026-11-01T10:30:00Z", weight: "90" }],
    startedAt: "2026-11-01T10:00:00Z",
    userId,
  });

const seedProfile = async () =>
  await withService((tx) =>
    tx.insert(profiles).values({
      age: 30,
      gender: "male",
      height: "180",
      measurementSystem: "metric",
      userId: owner,
      weight: "80",
    })
  );

const finishForgotten = async (sessionId: string) =>
  await withService(
    async (tx) => await finishForgottenWorkoutSession(tx, sessionId)
  );

const finishManually = async (sessionId: string, userId = owner) =>
  await asUser(userId, async (tx) => await finishWorkoutSession(tx, sessionId));

const finishedAtOf = async (sessionId: string) =>
  await withService(async (tx) => {
    const [row] = await tx
      .select({
        finishedAt: sql<
          string | null
        >`to_json(${workoutSessions.finishedAt}) #>> '{}'`,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));

    return row?.finishedAt;
  });

const workoutOrders = async (planId: string) =>
  await withService(async (tx) => {
    const rows = await tx
      .select({ name: workouts.name })
      .from(workouts)
      .where(eq(workouts.planId, planId))
      .orderBy(asc(workouts.order));

    return rows.map(({ name }) => name);
  });

const recordsOf = async (sessionId: string, userId = owner) => {
  const page = await asUser(
    userId,
    async (tx) =>
      await listWorkoutSessions(tx, { limit: 50, offset: 0, status: "all" })
  );

  return page.sessions.find(({ id }) => id === sessionId)?.personal_records;
};

const deferred = () => {
  const signal = new EventTarget();

  return {
    promise: once(signal, "resolved"),
    resolve: () => {
      signal.dispatchEvent(new Event("resolved"));
    },
  };
};

/**
 * Runs `first` in its transaction, starts `second` while that is still open,
 * and commits `first` once `second` has had time to block on it (or finish).
 */
const overlap = async <T, U>(
  inTransaction: (fn: (tx: Transaction) => Promise<T>) => Promise<T>,
  first: (tx: Transaction) => Promise<T>,
  second: () => Promise<U>
): Promise<[T, U]> => {
  const gate = deferred();
  const ready = deferred();

  const running = inTransaction(async (tx) => {
    const result = await first(tx);
    ready.resolve();
    await gate.promise;

    return result;
  });

  await Promise.race([ready.promise, running]);
  const following = second();

  try {
    await Promise.race([following, delay(250)]);
  } finally {
    gate.resolve();
  }

  return await Promise.all([running, following]);
};

describe("finishing a Forgotten Workout Session", () => {
  beforeEach(() => {
    owner = newUser();
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  describe("the rule", () => {
    it("finishes it at its last set's log time, microseconds included", async () => {
      const { sessionId } = await seedSession({
        sets: [...LOGGED.toReversed(), { loggedAt: null }],
      });

      await expect(finishForgotten(sessionId)).resolves.toStrictEqual({
        rotated: false,
        status: "finished",
      });
      await expect(finishedAtOf(sessionId)).resolves.toBe(LAST_LOGGED_AT);
    });

    it("finishes at exactly 3 hours and leaves it open a microsecond before", async () => {
      // One transaction, so one now()
      const results = await withService(async (tx) => {
        const just = await seedSessionIn(tx, {
          sets: [{ loggedAt: ago("3 hours") }],
        });

        const under = await seedSessionIn(tx, {
          sets: [
            { loggedAt: ago("3 days") },
            { loggedAt: ago("2 hours 59 minutes 59.999999 seconds") },
          ],
          userId: newUser(),
        });

        return {
          just: await finishForgottenWorkoutSession(tx, just.sessionId),
          under: await finishForgottenWorkoutSession(tx, under.sessionId),
          underId: under.sessionId,
        };
      });

      expect(results.just.status).toBe("finished");
      expect(results.under).toStrictEqual(LEFT_ALONE);
      await expect(finishedAtOf(results.underId)).resolves.toBeNull();
    });

    it("counts a set logged again from its new time", async () => {
      const { sessionId, setIds } = await seedSession();
      await asUser(
        owner,
        async (tx) =>
          await logSet(tx, {
            repsCompleted: 6,
            setId: setIds[0],
            weightCompleted: 100,
          })
      );

      await expect(finishForgotten(sessionId)).resolves.toStrictEqual(
        LEFT_ALONE
      );
      await expect(finishedAtOf(sessionId)).resolves.toBeNull();

      // ... 4 hours later
      await withService((tx) =>
        tx
          .update(workoutSessionExerciseSets)
          .set({ loggedAt: "2026-11-10T11:30:00.000001Z" })
          .where(eq(workoutSessionExerciseSets.id, setIds[0]))
      );
      await finishForgotten(sessionId);
      await expect(finishedAtOf(sessionId)).resolves.toBe(
        "2026-11-10T11:30:00.000001+00:00"
      );
    });

    it("doesn't count a removed set any more", async () => {
      const { sessionId, setIds } = await seedSession({
        sets: [{ loggedAt: LAST_LOGGED_AT }, { loggedAt: ago("1 hour") }],
      });

      await expect(finishForgotten(sessionId)).resolves.toStrictEqual(
        LEFT_ALONE
      );
      await asUser(
        owner,
        async (tx) => await removeSetFromWorkoutSession(tx, owner, setIds[1])
      );

      await finishForgotten(sessionId);
      await expect(finishedAtOf(sessionId)).resolves.toBe(LAST_LOGGED_AT);
    });

    it.each([
      ["a bodyweight set", { reps: 10, weight: null }],
      ["a 0-rep set", { reps: 0, weight: "100" }],
    ])("counts %s as logged", async (_name, set) => {
      const { sessionId } = await seedSession({
        sets: [{ loggedAt: LAST_LOGGED_AT, ...set }],
      });

      await finishForgotten(sessionId);
      await expect(finishedAtOf(sessionId)).resolves.toBe(LAST_LOGGED_AT);
    });

    it("leaves one with no logged set alone, with or without sets", async () => {
      const planned = await seedSession({ sets: [{ loggedAt: null }] });
      const empty = await seedSession({ sets: [], userId: newUser() });

      await expect(finishForgotten(planned.sessionId)).resolves.toStrictEqual(
        LEFT_ALONE
      );
      await expect(finishForgotten(empty.sessionId)).resolves.toStrictEqual(
        LEFT_ALONE
      );
      await expect(finishedAtOf(planned.sessionId)).resolves.toBeNull();
      await expect(finishedAtOf(empty.sessionId)).resolves.toBeNull();
    });

    it("leaves finished and unknown ones alone", async () => {
      const { planId, workoutId } = await seedPlan();
      const finishedAt = "2026-11-10T15:00:00+00:00";

      const { sessionId } = await seedSession({
        finishedAt,
        planId,
        workoutId,
      });

      await expect(finishForgotten(sessionId)).resolves.toStrictEqual(
        LEFT_ALONE
      );
      await expect(finishedAtOf(sessionId)).resolves.toBe(finishedAt);
      await expect(workoutOrders(planId)).resolves.toStrictEqual(["W1", "W2"]);
      const deleted = await seedSession({ userId: newUser() });
      await withService(
        async (tx) => await deleteWorkoutSession(tx, deleted.sessionId)
      );
      await expect(finishForgotten(deleted.sessionId)).resolves.toStrictEqual(
        LEFT_ALONE
      );
      await expect(finishForgotten(randomUUID())).resolves.toStrictEqual(
        LEFT_ALONE
      );
    });

    it("never backdates a manual finish, however late", async () => {
      const { sessionId } = await seedSession();
      const before = Date.now();

      await finishManually(sessionId);

      const finishedAt = await finishedAtOf(sessionId);
      // A minute of slack between this clock and Postgres's
      expect(Date.parse(finishedAt ?? "")).toBeGreaterThan(before - 60_000);
    });
  });

  describe("the same finish as a manual one", () => {
    it("matches its Personal records, rotation, Weekly goal and Lifetime totals", async () => {
      const outcomeOf = async (
        userId: string,
        finish: (sessionId: string) => Promise<unknown>
      ) => {
        const { planId, workoutId } = await seedPlan(userId);
        await seedEarlierSession(userId);
        const { sessionId } = await seedSession({ planId, userId, workoutId });
        await finish(sessionId);

        const goals = await asUser(
          userId,
          async (tx) => await listWeeklyGoalChanges(tx, userId)
        );

        const totals = await asUser(
          userId,
          async (tx) => await getLifetimeTotals(tx, userId)
        );

        return {
          goals: goals.map(({ target }) => target),
          orders: await workoutOrders(planId),
          records: await recordsOf(sessionId, userId),
          totals,
        };
      };

      const { totals: manualTotals, ...manual } = await outcomeOf(
        newUser(),
        async (sessionId) => await finishManually(sessionId, users.at(-1) ?? "")
      );

      const { totals, ...forgotten } = await outcomeOf(owner, finishForgotten);

      expect(forgotten).toStrictEqual(manual);
      expect(forgotten).toStrictEqual({
        goals: [3],
        orders: ["W2", "W1"],
        records: [
          { exercise_slug: SQUAT, kind: "weight", reps: 5, weight: 100 },
        ],
      });
      // The earlier one's hour, then 41:12 to the last set
      expect(totals).toStrictEqual({
        ...manualTotals,
        duration_seconds: 60 * 60 + 41 * 60 + 12,
      });
    });

    it("finishes without a rotation when its Workout or Plan is gone", async () => {
      const noWorkout = await seedPlan();
      const first = await seedSession(noWorkout);
      await withService((tx) =>
        tx.delete(workouts).where(eq(workouts.id, noWorkout.workoutId))
      );
      const other = newUser();
      const noPlan = await seedPlan(other);
      const second = await seedSession({ ...noPlan, userId: other });
      await withService((tx) =>
        tx.delete(plans).where(eq(plans.id, noPlan.planId))
      );

      const unrotated = { rotated: false, status: "finished" };
      await expect(finishForgotten(first.sessionId)).resolves.toStrictEqual(
        unrotated
      );
      await expect(finishForgotten(second.sessionId)).resolves.toStrictEqual(
        unrotated
      );
      await expect(finishedAtOf(second.sessionId)).resolves.toBe(
        LAST_LOGGED_AT
      );
    });

    it("never rotates another User's Plan", async () => {
      const foreign = await seedPlan(newUser());
      const { sessionId } = await seedSession(foreign);

      await expect(finishForgotten(sessionId)).resolves.toStrictEqual({
        rotated: false,
        status: "finished",
      });
      await expect(workoutOrders(foreign.planId)).resolves.toStrictEqual([
        "W1",
        "W2",
      ]);
    });
  });

  describe("races", () => {
    it("lets a set logged meanwhile win", async () => {
      const { planId, workoutId } = await seedPlan();
      const { sessionId, setIds } = await seedSession({ planId, workoutId });

      const [logged, result] = await overlap(
        async (fn: (tx: Transaction) => Promise<LogSetResult>) =>
          await asUser(owner, fn),
        async (tx) =>
          await logSet(tx, {
            repsCompleted: 5,
            setId: setIds[0],
            weightCompleted: 100,
          }),
        async () => await finishForgotten(sessionId)
      );

      expect(logged.status).toBe("logged");
      expect(result).toStrictEqual(LEFT_ALONE);
      await expect(finishedAtOf(sessionId)).resolves.toBeNull();
      await expect(workoutOrders(planId)).resolves.toStrictEqual(["W1", "W2"]);
    });

    it("finishes and awards once when repeated or overlapping", async () => {
      const { planId, workoutId } = await seedPlan();
      await seedEarlierSession();
      const { sessionId } = await seedSession({ planId, workoutId });

      const results = await overlap(
        withService,
        async (tx) => await finishForgottenWorkoutSession(tx, sessionId),
        async () => await finishForgotten(sessionId)
      );

      expect(results).toStrictEqual([
        { rotated: true, status: "finished" },
        LEFT_ALONE,
      ]);
      await expect(finishForgotten(sessionId)).resolves.toStrictEqual(
        LEFT_ALONE
      );
      await expect(recordsOf(sessionId)).resolves.toHaveLength(1);
      await expect(workoutOrders(planId)).resolves.toStrictEqual(["W2", "W1"]);
    });

    it("leaves one a manual finish is claiming alone", async () => {
      const { planId, workoutId } = await seedPlan();
      const { sessionId } = await seedSession({ planId, workoutId });

      const [manual, result] = await overlap(
        async (fn: (tx: Transaction) => Promise<FinishWorkoutSessionResult>) =>
          await asUser(owner, fn),
        async (tx) => await finishWorkoutSession(tx, sessionId),
        async () => await finishForgotten(sessionId)
      );

      expect(manual).toMatchObject({ alreadyFinished: false, rotated: true });
      expect(result).toStrictEqual(LEFT_ALONE);
      await expect(finishedAtOf(sessionId)).resolves.not.toBe(LAST_LOGGED_AT);
      await expect(workoutOrders(planId)).resolves.toStrictEqual(["W2", "W1"]);
    });

    it("queues behind an account deletion and writes nothing back", async () => {
      const { planId, workoutId } = await seedPlan();
      await seedProfile();
      await seedEarlierSession();
      const { sessionId } = await seedSession({ planId, workoutId });

      // deleteUserData's locks first, its deletes once the finish waits
      const finishing = withUserTablesLocked(async (tx) => {
        const waiting = finishForgotten(sessionId);
        // Awaited below; a failed deletion must not leave its rejection unhandled
        waiting.catch(() => null);
        await Promise.race([waiting, delay(250)]);
        await deleteUserData(tx, owner);

        // Wrapped, so returning it doesn't wait for this transaction's locks
        return { waiting };
      });

      const { waiting } = await finishing;
      await expect(waiting).resolves.toStrictEqual(LEFT_ALONE);
      await expect(finishedAtOf(sessionId)).resolves.toBeUndefined();

      const left = await withService(async (tx) => [
        await tx.$count(personalRecords, eq(personalRecords.userId, owner)),
        await tx.$count(weeklyGoalChanges, eq(weeklyGoalChanges.userId, owner)),
      ]);

      expect(left).toStrictEqual([0, 0]);
    });

    it.each(["conversion first", "finish first"])(
      "keeps records in the User's unit through a conversion (%s)",
      async (order) => {
        await seedProfile();
        await seedEarlierSession();
        const { sessionId } = await seedSession();

        const convert = async (tx: Transaction): Promise<unknown> =>
          await updateProfile(tx, owner, { measurement_system: "us" });

        const finish = async (tx: Transaction): Promise<unknown> =>
          await finishForgottenWorkoutSession(tx, sessionId);

        const asOwner = async <T>(fn: (tx: Transaction) => Promise<T>) =>
          await asUser(owner, fn);

        await (order === "conversion first"
          ? overlap(asOwner, convert, async () => await withService(finish))
          : overlap(withService, finish, async () => await asOwner(convert)));

        await expect(finishedAtOf(sessionId)).resolves.toBe(LAST_LOGGED_AT);
        // 100 kg × 2.20462
        await expect(recordsOf(sessionId)).resolves.toStrictEqual([
          { exercise_slug: SQUAT, kind: "weight", reps: 5, weight: 220.46 },
        ]);
      }
    );
  });
});
