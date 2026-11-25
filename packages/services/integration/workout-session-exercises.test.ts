import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import {
  asUser,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessionProgress,
  workoutSessions,
} from "@fitme/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deleteUserData } from "../src/delete-user-data";
import {
  addExerciseToWorkoutSession,
  addSetToWorkoutSessionExercise,
  finishWorkoutSession,
  removeExerciseFromWorkoutSession,
  removeSetFromWorkoutSession,
  replaceExerciseInWorkoutSession,
} from "../src/workout-sessions";
import { deleteTestUsers, withUserTablesLocked } from "./delete-test-users";

/**
 * Editing an open Workout Session's Exercises through asUser, against a local
 * Supabase stack via the Supavisor pooler as the fitme login. Made-up
 * Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);

/**
 * A fresh owner and intruder per test: a User has at most one open Workout
 * Session, so a test's open session would collide with the next test's.
 */
const users: string[] = [];
let owner = "";
let intruder = "";

const benchSlug = `test-edit-bench-${runId}`;
const squatSlug = `test-edit-squat-${runId}`;
const lungeSlug = `test-edit-lunge-${runId}`;

/** How PostgREST rendered timestamps, e.g. 2026-10-01T10:00:00.123+00:00. */
const POSTGREST_TIMESTAMP =
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?\+00:00$/u;

const anyString: unknown = expect.any(String);
const postgrestTimestamp: unknown = expect.stringMatching(POSTGREST_TIMESTAMP);

const insertSession = async (
  userId: string,
  { finished = false }: { finished?: boolean } = {}
) =>
  await withService(async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        finishedAt: finished ? "2026-10-01T11:00:00Z" : null,
        startedAt: "2026-10-01T10:00:00Z",
        userId,
      })
      .returning({ id: workoutSessions.id });

    return session.id;
  });

/** Exercises at 1 and 3: a remove left a gap at 2. Their ids, in order. */
const insertExercises = async (sessionId: string) =>
  await withService(async (tx) => {
    const inserted = await tx
      .insert(workoutSessionExercises)
      .values([
        { exerciseSlug: benchSlug, order: 1, workoutSessionId: sessionId },
        { exerciseSlug: squatSlug, order: 3, workoutSessionId: sessionId },
      ])
      .returning({ id: workoutSessionExercises.id });

    return inserted.map(({ id }) => id);
  });

/** Two sets with targets on a Workout Session Exercise, the first one logged. */
const insertSets = async (sessionExerciseId: string) =>
  await withService((tx) =>
    tx.insert(workoutSessionExerciseSets).values([
      {
        loggedAt: "2026-10-01T10:05:00Z",
        order: 1,
        repsCompleted: 9,
        repsRecommended: 10,
        restRecommended: 90,
        weightCompleted: "62.5",
        weightRecommended: "60",
        workoutSessionExerciseId: sessionExerciseId,
      },
      {
        order: 2,
        repsRecommended: 8,
        restRecommended: 90,
        weightRecommended: "65",
        workoutSessionExerciseId: sessionExerciseId,
      },
    ])
  );

const setsOf = async (sessionExerciseId: string) =>
  await withService((tx) =>
    tx
      .select({
        order: workoutSessionExerciseSets.order,
        repsCompleted: workoutSessionExerciseSets.repsCompleted,
        repsRecommended: workoutSessionExerciseSets.repsRecommended,
        restRecommended: workoutSessionExerciseSets.restRecommended,
        weightCompleted: workoutSessionExerciseSets.weightCompleted,
        weightRecommended: workoutSessionExerciseSets.weightRecommended,
      })
      .from(workoutSessionExerciseSets)
      .where(
        eq(
          workoutSessionExerciseSets.workoutSessionExerciseId,
          sessionExerciseId
        )
      )
      .orderBy(asc(workoutSessionExerciseSets.order))
  );

const exercisesOf = async (sessionId: string) =>
  await withService((tx) =>
    tx
      .select({
        exerciseSlug: workoutSessionExercises.exerciseSlug,
        order: workoutSessionExercises.order,
      })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.workoutSessionId, sessionId))
      .orderBy(asc(workoutSessionExercises.order))
  );

describe("workout session exercises", () => {
  beforeEach(() => {
    owner = `user_svcSessEditOwner${runId}${users.length}`;
    intruder = `user_svcSessEditIntruder${runId}${users.length}`;
    users.push(owner, intruder);
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  describe("adding an exercise to a workout session", () => {
    it("appends the Exercise after the open Workout Session's last one, with no sets", async () => {
      const sessionId = await insertSession(owner);
      await insertExercises(sessionId);

      const result = await asUser(
        owner,
        async (tx) =>
          await addExerciseToWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionId,
          })
      );

      expect(result).toStrictEqual({
        exercise: {
          exercise_slug: lungeSlug,
          id: anyString,
          order: 4,
          sets: [],
        },
        status: "added",
      });
      await expect(exercisesOf(sessionId)).resolves.toStrictEqual([
        { exerciseSlug: benchSlug, order: 1 },
        { exerciseSlug: squatSlug, order: 3 },
        { exerciseSlug: lungeSlug, order: 4 },
      ]);
    });

    it("starts at 1 in a Workout Session without Exercises", async () => {
      const sessionId = await insertSession(owner);

      const result = await asUser(
        owner,
        async (tx) =>
          await addExerciseToWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionId,
          })
      );

      expect(result).toMatchObject({ exercise: { order: 1 }, status: "added" });
    });

    it("writes nothing to a finished Workout Session", async () => {
      const sessionId = await insertSession(owner, { finished: true });
      await insertExercises(sessionId);

      const result = await asUser(
        owner,
        async (tx) =>
          await addExerciseToWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionId,
          })
      );

      expect(result).toStrictEqual({
        finishedAt: postgrestTimestamp,
        status: "session_finished",
      });
      await expect(exercisesOf(sessionId)).resolves.toStrictEqual([
        { exerciseSlug: benchSlug, order: 1 },
        { exerciseSlug: squatSlug, order: 3 },
      ]);
    });

    it("finds no Workout Session of another User's, or an unknown id, and writes nothing", async () => {
      const intruderSessionId = await insertSession(intruder);

      const results = await Promise.all(
        [intruderSessionId, randomUUID()].map(
          async (sessionId) =>
            await asUser(
              owner,
              async (tx) =>
                await addExerciseToWorkoutSession(tx, owner, {
                  exerciseSlug: lungeSlug,
                  sessionId,
                })
            )
        )
      );

      expect(results).toStrictEqual([
        { status: "not_found" },
        { status: "not_found" },
      ]);
      await expect(exercisesOf(intruderSessionId)).resolves.toStrictEqual([]);
    });

    it("gives concurrent adds to one Workout Session distinct, consecutive orders", async () => {
      const sessionId = await insertSession(owner);
      await insertExercises(sessionId);

      const results = await Promise.all(
        Array.from(
          { length: 5 },
          async () =>
            await asUser(
              owner,
              async (tx) =>
                await addExerciseToWorkoutSession(tx, owner, {
                  exerciseSlug: lungeSlug,
                  sessionId,
                })
            )
        )
      );

      const orders = results.map((result) =>
        result.status === "added" ? result.exercise.order : null
      );

      expect(orders.toSorted((a, b) => (a ?? 0) - (b ?? 0))).toStrictEqual([
        4, 5, 6, 7, 8,
      ]);
    });
  });

  describe("removing an exercise from a workout session", () => {
    it("deletes the Exercise and its sets, leaving the others' order and the gap", async () => {
      const sessionId = await insertSession(owner);
      const [benchId, squatId] = await insertExercises(sessionId);
      await insertSets(benchId);
      await insertSets(squatId);

      const result = await asUser(
        owner,
        async (tx) => await removeExerciseFromWorkoutSession(tx, owner, benchId)
      );

      expect(result).toStrictEqual({ status: "removed" });
      await expect(exercisesOf(sessionId)).resolves.toStrictEqual([
        { exerciseSlug: squatSlug, order: 3 },
      ]);
      await expect(setsOf(benchId)).resolves.toStrictEqual([]);
      await expect(setsOf(squatId)).resolves.toHaveLength(2);

      // Adding after the remove appends after the highest order: the gap stays.
      await asUser(
        owner,
        async (tx) =>
          await addExerciseToWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionId,
          })
      );
      await expect(exercisesOf(sessionId)).resolves.toStrictEqual([
        { exerciseSlug: squatSlug, order: 3 },
        { exerciseSlug: lungeSlug, order: 4 },
      ]);
    });

    it("finds nothing on a repeat", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      await asUser(
        owner,
        async (tx) => await removeExerciseFromWorkoutSession(tx, owner, benchId)
      );

      const repeat = await asUser(
        owner,
        async (tx) => await removeExerciseFromWorkoutSession(tx, owner, benchId)
      );

      expect(repeat).toStrictEqual({ status: "not_found" });
    });

    it("deletes nothing of a finished Workout Session", async () => {
      const sessionId = await insertSession(owner, { finished: true });
      const [benchId] = await insertExercises(sessionId);

      const result = await asUser(
        owner,
        async (tx) => await removeExerciseFromWorkoutSession(tx, owner, benchId)
      );

      expect(result).toStrictEqual({
        finishedAt: postgrestTimestamp,
        sessionId,
        status: "session_finished",
      });
      await expect(exercisesOf(sessionId)).resolves.toHaveLength(2);
    });

    it("finds no Exercise of another User's, or an unknown id, and deletes nothing", async () => {
      const sessionId = await insertSession(intruder);
      const [benchId] = await insertExercises(sessionId);

      const results = await Promise.all(
        [benchId, randomUUID()].map(
          async (id) =>
            await asUser(
              owner,
              async (tx) =>
                await removeExerciseFromWorkoutSession(tx, owner, id)
            )
        )
      );

      expect(results).toStrictEqual([
        { status: "not_found" },
        { status: "not_found" },
      ]);
      await expect(exercisesOf(sessionId)).resolves.toHaveLength(2);
    });
  });

  describe("replacing an exercise in a workout session", () => {
    it("swaps the slug and zeroes every set's targets, keeping the row, its place and the logged values", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      await insertSets(benchId);

      const result = await asUser(
        owner,
        async (tx) =>
          await replaceExerciseInWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionExerciseId: benchId,
          })
      );

      expect(result).toStrictEqual({
        exercise: {
          exercise_slug: lungeSlug,
          id: benchId,
          order: 1,
          sets: [
            {
              id: anyString,
              logged_at: postgrestTimestamp,
              order: 1,
              reps_completed: 9,
              reps_recommended: 0,
              rest_recommended: 90,
              weight_completed: 62.5,
              weight_recommended: 0,
            },
            {
              id: anyString,
              logged_at: null,
              order: 2,
              reps_completed: null,
              reps_recommended: 0,
              rest_recommended: 90,
              weight_completed: null,
              weight_recommended: 0,
            },
          ],
        },
        status: "replaced",
      });
      await expect(exercisesOf(sessionId)).resolves.toStrictEqual([
        { exerciseSlug: lungeSlug, order: 1 },
        { exerciseSlug: squatSlug, order: 3 },
      ]);
      await expect(setsOf(benchId)).resolves.toStrictEqual([
        {
          order: 1,
          repsCompleted: 9,
          repsRecommended: 0,
          restRecommended: 90,
          weightCompleted: "62.50",
          weightRecommended: "0.00",
        },
        {
          order: 2,
          repsCompleted: null,
          repsRecommended: 0,
          restRecommended: 90,
          weightCompleted: null,
          weightRecommended: "0.00",
        },
      ]);
    });

    it("changes nothing of a finished Workout Session", async () => {
      const sessionId = await insertSession(owner, { finished: true });
      const [benchId] = await insertExercises(sessionId);
      await insertSets(benchId);

      const result = await asUser(
        owner,
        async (tx) =>
          await replaceExerciseInWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionExerciseId: benchId,
          })
      );

      expect(result).toMatchObject({ sessionId, status: "session_finished" });
      await expect(exercisesOf(sessionId)).resolves.toStrictEqual([
        { exerciseSlug: benchSlug, order: 1 },
        { exerciseSlug: squatSlug, order: 3 },
      ]);
      const sets = await setsOf(benchId);
      expect(sets.map(({ repsRecommended }) => repsRecommended)).toStrictEqual([
        10, 8,
      ]);
    });

    it("finds no Exercise of another User's, or an unknown id, and changes nothing", async () => {
      const sessionId = await insertSession(intruder);
      const [benchId] = await insertExercises(sessionId);

      const results = await Promise.all(
        [benchId, randomUUID()].map(
          async (sessionExerciseId) =>
            await asUser(
              owner,
              async (tx) =>
                await replaceExerciseInWorkoutSession(tx, owner, {
                  exerciseSlug: lungeSlug,
                  sessionExerciseId,
                })
            )
        )
      );

      expect(results).toStrictEqual([
        { status: "not_found" },
        { status: "not_found" },
      ]);
      await expect(exercisesOf(sessionId)).resolves.toStrictEqual([
        { exerciseSlug: benchSlug, order: 1 },
        { exerciseSlug: squatSlug, order: 3 },
      ]);
    });
  });

  describe("adding a set to a workout session exercise", () => {
    const logged = { repsCompleted: 7, weightCompleted: 72.5 };

    it("appends a logged set with the server's time and no targets", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      await insertSets(benchId);

      const result = await asUser(
        owner,
        async (tx) =>
          await addSetToWorkoutSessionExercise(tx, owner, {
            ...logged,
            sessionExerciseId: benchId,
          })
      );

      expect(result).toStrictEqual({
        set: {
          id: anyString,
          logged_at: postgrestTimestamp,
          order: 3,
          reps_completed: 7,
          reps_recommended: null,
          rest_recommended: null,
          weight_completed: 72.5,
          weight_recommended: null,
        },
        status: "added",
      });
      const sets = await setsOf(benchId);
      expect(sets.at(-1)).toStrictEqual({
        order: 3,
        repsCompleted: 7,
        repsRecommended: null,
        restRecommended: null,
        weightCompleted: "72.50",
        weightRecommended: null,
      });
    });

    it("starts at 1 for a Workout Session Exercise without sets", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);

      const result = await asUser(
        owner,
        async (tx) =>
          await addSetToWorkoutSessionExercise(tx, owner, {
            ...logged,
            sessionExerciseId: benchId,
          })
      );

      expect(result).toMatchObject({ set: { order: 1 }, status: "added" });
    });

    it("writes nothing to a finished Workout Session", async () => {
      const sessionId = await insertSession(owner, { finished: true });
      const [benchId] = await insertExercises(sessionId);
      await insertSets(benchId);

      const result = await asUser(
        owner,
        async (tx) =>
          await addSetToWorkoutSessionExercise(tx, owner, {
            ...logged,
            sessionExerciseId: benchId,
          })
      );

      expect(result).toStrictEqual({
        finishedAt: postgrestTimestamp,
        sessionId,
        status: "session_finished",
      });
      await expect(setsOf(benchId)).resolves.toHaveLength(2);
    });

    it("finds no Exercise of another User's, or an unknown id, and writes nothing", async () => {
      const sessionId = await insertSession(intruder);
      const [benchId] = await insertExercises(sessionId);

      const results = await Promise.all(
        [benchId, randomUUID()].map(
          async (sessionExerciseId) =>
            await asUser(
              owner,
              async (tx) =>
                await addSetToWorkoutSessionExercise(tx, owner, {
                  ...logged,
                  sessionExerciseId,
                })
            )
        )
      );

      expect(results).toStrictEqual([
        { status: "not_found" },
        { status: "not_found" },
      ]);
      await expect(setsOf(benchId)).resolves.toStrictEqual([]);
    });

    it("gives concurrent adds to one Workout Session Exercise distinct, consecutive orders", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      await insertSets(benchId);

      const results = await Promise.all(
        Array.from(
          { length: 5 },
          async () =>
            await asUser(
              owner,
              async (tx) =>
                await addSetToWorkoutSessionExercise(tx, owner, {
                  ...logged,
                  sessionExerciseId: benchId,
                })
            )
        )
      );

      const orders = results.map((result) =>
        result.status === "added" ? result.set.order : null
      );

      expect(orders.toSorted((a, b) => (a ?? 0) - (b ?? 0))).toStrictEqual([
        3, 4, 5, 6, 7,
      ]);
    });
  });

  describe("removing a set from a workout session", () => {
    const HOLDS_LOCKS_MS = 500;

    const removeSet = async (setId: string) =>
      await asUser(
        owner,
        async (tx) => await removeSetFromWorkoutSession(tx, owner, setId)
      );

    /** A logged planned set, an unlogged planned set and an added one, in order. */
    const insertPlannedAndAddedSets = async (sessionExerciseId: string) => {
      await insertSets(sessionExerciseId);

      return await withService(async (tx) => {
        await tx.insert(workoutSessionExerciseSets).values({
          loggedAt: "2026-10-01T10:15:00Z",
          order: 3,
          repsCompleted: 6,
          weightCompleted: "60",
          workoutSessionExerciseId: sessionExerciseId,
        });

        const sets = await tx
          .select({ id: workoutSessionExerciseSets.id })
          .from(workoutSessionExerciseSets)
          .where(
            eq(
              workoutSessionExerciseSets.workoutSessionExerciseId,
              sessionExerciseId
            )
          )
          .orderBy(asc(workoutSessionExerciseSets.order));

        return sets.map(({ id }) => id);
      });
    };

    const ordersOf = async (sessionExerciseId: string) => {
      const sets = await setsOf(sessionExerciseId);

      return sets.map(({ order }) => order);
    };

    const completedSetsOf = async (sessionId: string) => {
      const [progress] = await withService((tx) =>
        tx
          .select({ completed: workoutSessionProgress.completedSetCount })
          .from(workoutSessionProgress)
          .where(eq(workoutSessionProgress.workoutSessionId, sessionId))
      );

      return progress.completed;
    };

    it.each([
      { left: [2, 3], position: 1, set: "a logged" },
      { left: [1, 3], position: 2, set: "a planned" },
      { left: [1, 2], position: 3, set: "an added" },
    ])(
      "removes $set set and leaves the others as they were",
      async ({ left, position }) => {
        const sessionId = await insertSession(owner);
        const [benchId, squatId] = await insertExercises(sessionId);
        const setIds = await insertPlannedAndAddedSets(benchId);
        await insertSets(squatId);
        const before = await setsOf(benchId);

        await expect(removeSet(setIds[position - 1])).resolves.toStrictEqual({
          status: "removed",
        });

        await expect(setsOf(benchId)).resolves.toStrictEqual(
          before.filter(({ order }) => left.includes(order))
        );
        await expect(ordersOf(squatId)).resolves.toStrictEqual([1, 2]);
      }
    );

    it("keeps an Exercise whose every set was removed", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      const [first, second, third] = await insertPlannedAndAddedSets(benchId);

      await removeSet(first);
      await removeSet(second);
      await expect(removeSet(third)).resolves.toStrictEqual({
        status: "removed",
      });

      await expect(setsOf(benchId)).resolves.toStrictEqual([]);
      await expect(exercisesOf(sessionId)).resolves.toStrictEqual([
        { exerciseSlug: benchSlug, order: 1 },
        { exerciseSlug: squatSlug, order: 3 },
      ]);
    });

    it.each([
      { orders: [1, 3, 4], position: 2 },
      // The highest order was removed, so the added set takes it again
      { orders: [1, 2, 3], position: 3 },
    ])(
      "adds a set after the highest order left once set $position is gone",
      async ({ orders, position }) => {
        const sessionId = await insertSession(owner);
        const [benchId] = await insertExercises(sessionId);
        const setIds = await insertPlannedAndAddedSets(benchId);
        await removeSet(setIds[position - 1]);

        await asUser(
          owner,
          async (tx) =>
            await addSetToWorkoutSessionExercise(tx, owner, {
              repsCompleted: 7,
              sessionExerciseId: benchId,
              weightCompleted: 72.5,
            })
        );

        await expect(ordersOf(benchId)).resolves.toStrictEqual(orders);
      }
    );

    it("takes a removed logged set out of progress", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      const [logged, unlogged] = await insertPlannedAndAddedSets(benchId);
      await expect(completedSetsOf(sessionId)).resolves.toBe(2);

      await removeSet(logged);
      await expect(completedSetsOf(sessionId)).resolves.toBe(1);

      await removeSet(unlogged);
      await expect(completedSetsOf(sessionId)).resolves.toBe(1);
    });

    it("finds nothing on a repeat and removes nothing more", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      const [first] = await insertPlannedAndAddedSets(benchId);
      await removeSet(first);

      await expect(removeSet(first)).resolves.toStrictEqual({
        status: "not_found",
      });
      await expect(ordersOf(benchId)).resolves.toStrictEqual([2, 3]);
    });

    it("removes nothing from a finished Workout Session", async () => {
      const sessionId = await insertSession(owner, { finished: true });
      const [benchId] = await insertExercises(sessionId);
      const [first] = await insertPlannedAndAddedSets(benchId);

      await expect(removeSet(first)).resolves.toStrictEqual({
        finishedAt: postgrestTimestamp,
        sessionId,
        status: "session_finished",
      });
      await expect(ordersOf(benchId)).resolves.toStrictEqual([1, 2, 3]);
    });

    it("finds no set of another User's, or an unknown id, and removes nothing", async () => {
      const sessionId = await insertSession(intruder);
      const [benchId] = await insertExercises(sessionId);
      const [first] = await insertPlannedAndAddedSets(benchId);

      const results = await Promise.all([first, randomUUID()].map(removeSet));

      expect(results).toStrictEqual([
        { status: "not_found" },
        { status: "not_found" },
      ]);
      await expect(ordersOf(benchId)).resolves.toStrictEqual([1, 2, 3]);
    });

    it("filters on the User id where RLS doesn't", async () => {
      const sessionId = await insertSession(intruder);
      const [benchId] = await insertExercises(sessionId);
      const [first] = await insertPlannedAndAddedSets(benchId);

      const result = await withService(
        async (tx) => await removeSetFromWorkoutSession(tx, owner, first)
      );

      expect(result).toStrictEqual({ status: "not_found" });
      await expect(ordersOf(benchId)).resolves.toStrictEqual([1, 2, 3]);
    });

    it("removes a set once when two calls race", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      const [first] = await insertPlannedAndAddedSets(benchId);

      const results = await Promise.all([first, first].map(removeSet));

      expect(results.map(({ status }) => status).toSorted()).toStrictEqual([
        "not_found",
        "removed",
      ]);
      await expect(ordersOf(benchId)).resolves.toStrictEqual([2, 3]);
    });

    it("makes a concurrent finish wait for the removal", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      const [first] = await insertPlannedAndAddedSets(benchId);
      let finishing: ReturnType<typeof finishWorkoutSession> | undefined;

      const result = await asUser(owner, async (tx) => {
        const removal = await removeSetFromWorkoutSession(tx, owner, first);
        finishing = asUser(
          owner,
          async (finishTx) => await finishWorkoutSession(finishTx, sessionId)
        );
        // A finish that doesn't wait would read the set before it's gone
        await Promise.race([finishing, setTimeout(HOLDS_LOCKS_MS)]);

        return removal;
      });

      expect(result).toStrictEqual({ status: "removed" });
      const finished = await finishing;
      expect(finished).toMatchObject({ status: "finished" });

      const [bench] =
        finished?.status === "finished" ? finished.session.exercises : [];

      expect(bench.sets.map(({ order }) => order)).toStrictEqual([2, 3]);
    });

    it("is refused by a finish that was first", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      const [first] = await insertPlannedAndAddedSets(benchId);
      let removing: ReturnType<typeof removeSet> | undefined;

      await asUser(owner, async (tx) => {
        await finishWorkoutSession(tx, sessionId);
        removing = removeSet(first);
        // A removal that doesn't wait would still see the session open
        await Promise.race([removing, setTimeout(HOLDS_LOCKS_MS)]);
      });

      await expect(removing).resolves.toMatchObject({
        sessionId,
        status: "session_finished",
      });
      await expect(ordersOf(benchId)).resolves.toStrictEqual([1, 2, 3]);
    });

    it("queues behind an account deletion instead of deadlocking with it", async () => {
      const sessionId = await insertSession(owner);
      const [benchId] = await insertExercises(sessionId);
      const [first] = await insertPlannedAndAddedSets(benchId);
      let removing: ReturnType<typeof removeSet> | undefined;

      await withUserTablesLocked(async (tx) => {
        removing = removeSet(first);
        // Let it get as far as it can before the cascade needs its rows
        await setTimeout(HOLDS_LOCKS_MS);
        await deleteUserData(tx, owner);
      });

      // The set is gone with the account by then
      await expect(removing).resolves.toStrictEqual({ status: "not_found" });
    });
  });
});
