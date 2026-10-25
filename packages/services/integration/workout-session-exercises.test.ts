import { randomUUID } from "node:crypto";
import {
  asUser,
  withService,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addExerciseToWorkoutSession } from "../src/workout-sessions";
import { deleteTestUsers } from "./delete-test-users";

/**
 * Editing an open Workout Session's Exercises through asUser, against a local
 * Supabase stack via the Supavisor pooler as the fitme login. Made-up
 * Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcSessEditOwner${runId}`;
const intruder = `user_svcSessEditIntruder${runId}`;

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

/** Exercises at 1 and 3: a remove left a gap at 2. */
const insertExercises = (sessionId: string) =>
  withService((tx) =>
    tx.insert(workoutSessionExercises).values([
      { exerciseSlug: benchSlug, order: 1, workoutSessionId: sessionId },
      { exerciseSlug: squatSlug, order: 3, workoutSessionId: sessionId },
    ])
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

let intruderSessionId: string;

beforeAll(async () => {
  intruderSessionId = await insertSession(intruder);
});

afterAll(async () => {
  await deleteTestUsers([owner, intruder]);
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
    expect(orders.sort()).toEqual([4, 5, 6, 7, 8]);
  });
});
