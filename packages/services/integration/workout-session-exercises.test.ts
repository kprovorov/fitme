import { randomUUID } from "node:crypto";
import {
  asUser,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  addExerciseToWorkoutSession,
  addSetToWorkoutSessionExercise,
  removeExerciseFromWorkoutSession,
  replaceExerciseInWorkoutSession,
} from "../src/workout-sessions";
import { deleteTestUsers } from "./delete-test-users";

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
beforeEach(() => {
  owner = `user_svcSessEditOwner${runId}${users.length}`;
  intruder = `user_svcSessEditIntruder${runId}${users.length}`;
  users.push(owner, intruder);
});

const benchSlug = `test-edit-bench-${runId}`;
const squatSlug = `test-edit-squat-${runId}`;
const lungeSlug = `test-edit-lunge-${runId}`;

/** How PostgREST rendered timestamps, e.g. 2026-10-01T10:00:00.123+00:00. */
const POSTGREST_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?\+00:00$/;

const insertSession = (
  userId: string,
  { finished = false }: { finished?: boolean } = {}
) =>
  withService(async (tx) => {
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
const insertExercises = (sessionId: string) =>
  withService(async (tx) => {
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
const insertSets = (sessionExerciseId: string) =>
  withService((tx) =>
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

const setsOf = (sessionExerciseId: string) =>
  withService((tx) =>
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

const exercisesOf = (sessionId: string) =>
  withService((tx) =>
    tx
      .select({
        exerciseSlug: workoutSessionExercises.exerciseSlug,
        order: workoutSessionExercises.order,
      })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.workoutSessionId, sessionId))
      .orderBy(asc(workoutSessionExercises.order))
  );

afterAll(async () => {
  await deleteTestUsers(users);
});

describe("addExerciseToWorkoutSession", () => {
  it("appends the Exercise after the open Workout Session's last one, with no sets", async () => {
    const sessionId = await insertSession(owner);
    await insertExercises(sessionId);

    const result = await asUser(owner, (tx) =>
      addExerciseToWorkoutSession(tx, owner, {
        exerciseSlug: lungeSlug,
        sessionId,
      })
    );

    expect(result).toEqual({
      exercise: {
        exercise_slug: lungeSlug,
        id: expect.any(String),
        order: 4,
        sets: [],
      },
      status: "added",
    });
    expect(await exercisesOf(sessionId)).toEqual([
      { exerciseSlug: benchSlug, order: 1 },
      { exerciseSlug: squatSlug, order: 3 },
      { exerciseSlug: lungeSlug, order: 4 },
    ]);
  });

  it("starts at 1 in a Workout Session without Exercises", async () => {
    const sessionId = await insertSession(owner);

    const result = await asUser(owner, (tx) =>
      addExerciseToWorkoutSession(tx, owner, {
        exerciseSlug: lungeSlug,
        sessionId,
      })
    );

    expect(result).toMatchObject({ exercise: { order: 1 }, status: "added" });
  });

  it("writes nothing to a finished Workout Session", async () => {
    const sessionId = await insertSession(owner, { finished: true });
    await insertExercises(sessionId);

    const result = await asUser(owner, (tx) =>
      addExerciseToWorkoutSession(tx, owner, {
        exerciseSlug: lungeSlug,
        sessionId,
      })
    );

    expect(result).toEqual({
      finishedAt: expect.stringMatching(POSTGREST_TIMESTAMP),
      status: "session_finished",
    });
    expect(await exercisesOf(sessionId)).toEqual([
      { exerciseSlug: benchSlug, order: 1 },
      { exerciseSlug: squatSlug, order: 3 },
    ]);
  });

  it("finds no Workout Session of another User's, or an unknown id, and writes nothing", async () => {
    const intruderSessionId = await insertSession(intruder);
    const results = await Promise.all(
      [intruderSessionId, randomUUID()].map((sessionId) =>
        asUser(owner, (tx) =>
          addExerciseToWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionId,
          })
        )
      )
    );

    expect(results).toEqual([{ status: "not_found" }, { status: "not_found" }]);
    expect(await exercisesOf(intruderSessionId)).toEqual([]);
  });

  it("gives concurrent adds to one Workout Session distinct, consecutive orders", async () => {
    const sessionId = await insertSession(owner);
    await insertExercises(sessionId);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        asUser(owner, (tx) =>
          addExerciseToWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionId,
          })
        )
      )
    );

    const orders = results.map((result) =>
      result.status === "added" ? result.exercise.order : null
    );
    expect(orders.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([4, 5, 6, 7, 8]);
  });
});

describe("removeExerciseFromWorkoutSession", () => {
  it("deletes the Exercise and its sets, leaving the others' order and the gap", async () => {
    const sessionId = await insertSession(owner);
    const [benchId, squatId] = await insertExercises(sessionId);
    await insertSets(benchId as string);
    await insertSets(squatId as string);

    const result = await asUser(owner, (tx) =>
      removeExerciseFromWorkoutSession(tx, owner, benchId as string)
    );

    expect(result).toEqual({ status: "removed" });
    expect(await exercisesOf(sessionId)).toEqual([
      { exerciseSlug: squatSlug, order: 3 },
    ]);
    expect(await setsOf(benchId as string)).toEqual([]);
    expect(await setsOf(squatId as string)).toHaveLength(2);

    // Adding after the remove appends after the highest order: the gap stays.
    await asUser(owner, (tx) =>
      addExerciseToWorkoutSession(tx, owner, {
        exerciseSlug: lungeSlug,
        sessionId,
      })
    );
    expect(await exercisesOf(sessionId)).toEqual([
      { exerciseSlug: squatSlug, order: 3 },
      { exerciseSlug: lungeSlug, order: 4 },
    ]);
  });

  it("finds nothing on a repeat", async () => {
    const sessionId = await insertSession(owner);
    const [benchId] = await insertExercises(sessionId);
    await asUser(owner, (tx) =>
      removeExerciseFromWorkoutSession(tx, owner, benchId as string)
    );

    const repeat = await asUser(owner, (tx) =>
      removeExerciseFromWorkoutSession(tx, owner, benchId as string)
    );

    expect(repeat).toEqual({ status: "not_found" });
  });

  it("deletes nothing of a finished Workout Session", async () => {
    const sessionId = await insertSession(owner, { finished: true });
    const [benchId] = await insertExercises(sessionId);

    const result = await asUser(owner, (tx) =>
      removeExerciseFromWorkoutSession(tx, owner, benchId as string)
    );

    expect(result).toEqual({
      finishedAt: expect.stringMatching(POSTGREST_TIMESTAMP),
      sessionId,
      status: "session_finished",
    });
    expect(await exercisesOf(sessionId)).toHaveLength(2);
  });

  it("finds no Exercise of another User's, or an unknown id, and deletes nothing", async () => {
    const sessionId = await insertSession(intruder);
    const [benchId] = await insertExercises(sessionId);

    const results = await Promise.all(
      [benchId as string, randomUUID()].map((id) =>
        asUser(owner, (tx) => removeExerciseFromWorkoutSession(tx, owner, id))
      )
    );

    expect(results).toEqual([{ status: "not_found" }, { status: "not_found" }]);
    expect(await exercisesOf(sessionId)).toHaveLength(2);
  });
});

describe("replaceExerciseInWorkoutSession", () => {
  it("swaps the slug and zeroes every set's targets, keeping the row, its place and the logged values", async () => {
    const sessionId = await insertSession(owner);
    const [benchId] = await insertExercises(sessionId);
    await insertSets(benchId as string);

    const result = await asUser(owner, (tx) =>
      replaceExerciseInWorkoutSession(tx, owner, {
        exerciseSlug: lungeSlug,
        sessionExerciseId: benchId as string,
      })
    );

    expect(result).toEqual({
      exercise: {
        exercise_slug: lungeSlug,
        id: benchId,
        order: 1,
        sets: [
          {
            id: expect.any(String),
            logged_at: expect.stringMatching(POSTGREST_TIMESTAMP),
            order: 1,
            reps_completed: 9,
            reps_recommended: 0,
            rest_recommended: 90,
            weight_completed: 62.5,
            weight_recommended: 0,
          },
          {
            id: expect.any(String),
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
    expect(await exercisesOf(sessionId)).toEqual([
      { exerciseSlug: lungeSlug, order: 1 },
      { exerciseSlug: squatSlug, order: 3 },
    ]);
    expect(await setsOf(benchId as string)).toEqual([
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
    await insertSets(benchId as string);

    const result = await asUser(owner, (tx) =>
      replaceExerciseInWorkoutSession(tx, owner, {
        exerciseSlug: lungeSlug,
        sessionExerciseId: benchId as string,
      })
    );

    expect(result).toMatchObject({ sessionId, status: "session_finished" });
    expect(await exercisesOf(sessionId)).toEqual([
      { exerciseSlug: benchSlug, order: 1 },
      { exerciseSlug: squatSlug, order: 3 },
    ]);
    expect(
      (await setsOf(benchId as string)).map(
        ({ repsRecommended }) => repsRecommended
      )
    ).toEqual([10, 8]);
  });

  it("finds no Exercise of another User's, or an unknown id, and changes nothing", async () => {
    const sessionId = await insertSession(intruder);
    const [benchId] = await insertExercises(sessionId);

    const results = await Promise.all(
      [benchId as string, randomUUID()].map((sessionExerciseId) =>
        asUser(owner, (tx) =>
          replaceExerciseInWorkoutSession(tx, owner, {
            exerciseSlug: lungeSlug,
            sessionExerciseId,
          })
        )
      )
    );

    expect(results).toEqual([{ status: "not_found" }, { status: "not_found" }]);
    expect(await exercisesOf(sessionId)).toEqual([
      { exerciseSlug: benchSlug, order: 1 },
      { exerciseSlug: squatSlug, order: 3 },
    ]);
  });
});

describe("addSetToWorkoutSessionExercise", () => {
  const logged = { repsCompleted: 7, weightCompleted: 72.5 };

  it("appends a logged set with the server's time and no targets", async () => {
    const sessionId = await insertSession(owner);
    const [benchId] = await insertExercises(sessionId);
    await insertSets(benchId as string);

    const result = await asUser(owner, (tx) =>
      addSetToWorkoutSessionExercise(tx, owner, {
        ...logged,
        sessionExerciseId: benchId as string,
      })
    );

    expect(result).toEqual({
      set: {
        id: expect.any(String),
        logged_at: expect.stringMatching(POSTGREST_TIMESTAMP),
        order: 3,
        reps_completed: 7,
        reps_recommended: null,
        rest_recommended: null,
        weight_completed: 72.5,
        weight_recommended: null,
      },
      status: "added",
    });
    expect((await setsOf(benchId as string)).at(-1)).toEqual({
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

    const result = await asUser(owner, (tx) =>
      addSetToWorkoutSessionExercise(tx, owner, {
        ...logged,
        sessionExerciseId: benchId as string,
      })
    );

    expect(result).toMatchObject({ set: { order: 1 }, status: "added" });
  });

  it("writes nothing to a finished Workout Session", async () => {
    const sessionId = await insertSession(owner, { finished: true });
    const [benchId] = await insertExercises(sessionId);
    await insertSets(benchId as string);

    const result = await asUser(owner, (tx) =>
      addSetToWorkoutSessionExercise(tx, owner, {
        ...logged,
        sessionExerciseId: benchId as string,
      })
    );

    expect(result).toEqual({
      finishedAt: expect.stringMatching(POSTGREST_TIMESTAMP),
      sessionId,
      status: "session_finished",
    });
    expect(await setsOf(benchId as string)).toHaveLength(2);
  });

  it("finds no Exercise of another User's, or an unknown id, and writes nothing", async () => {
    const sessionId = await insertSession(intruder);
    const [benchId] = await insertExercises(sessionId);

    const results = await Promise.all(
      [benchId as string, randomUUID()].map((sessionExerciseId) =>
        asUser(owner, (tx) =>
          addSetToWorkoutSessionExercise(tx, owner, {
            ...logged,
            sessionExerciseId,
          })
        )
      )
    );

    expect(results).toEqual([{ status: "not_found" }, { status: "not_found" }]);
    expect(await setsOf(benchId as string)).toEqual([]);
  });

  it("gives concurrent adds to one Workout Session Exercise distinct, consecutive orders", async () => {
    const sessionId = await insertSession(owner);
    const [benchId] = await insertExercises(sessionId);
    await insertSets(benchId as string);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        asUser(owner, (tx) =>
          addSetToWorkoutSessionExercise(tx, owner, {
            ...logged,
            sessionExerciseId: benchId as string,
          })
        )
      )
    );

    const orders = results.map((result) =>
      result.status === "added" ? result.set.order : null
    );
    expect(orders.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([3, 4, 5, 6, 7]);
  });
});
