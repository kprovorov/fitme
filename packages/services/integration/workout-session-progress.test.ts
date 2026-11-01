import { randomUUID } from "node:crypto";
import {
  asUser,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessionProgress,
  workoutSessions,
} from "@fitme/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { deleteTestUsers } from "./delete-test-users";

const users: string[] = [];
afterAll(() => deleteTestUsers(users));
const seed = () => {
  const user = `user_progress${randomUUID().replaceAll("-", "")}`;
  users.push(user);
  return withService(async (tx) => {
    const sessions = await tx
      .insert(workoutSessions)
      .values(
        [0, 1].map(() => ({
          finishedAt: "2026-10-31T11:00:00Z",
          startedAt: "2026-10-31T10:00:00Z",
          userId: user,
        }))
      )
      .returning();
    const exercises = await tx
      .insert(workoutSessionExercises)
      .values(
        sessions.map((session) => ({
          exerciseSlug: "progress-fixture",
          order: 1,
          workoutSessionId: session.id,
        }))
      )
      .returning();
    return { exercises, sessions, user };
  });
};
const progress = (user: string) =>
  asUser(user, (tx) => tx.select().from(workoutSessionProgress));
const addSet = (user: string, exercise: string, reps: number | null) =>
  asUser(user, async (tx) => {
    const [set] = await tx
      .insert(workoutSessionExerciseSets)
      .values({
        order: 1,
        repsCompleted: reps,
        workoutSessionExerciseId: exercise,
      })
      .returning();
    return set;
  });
const counts = async (user: string) =>
  Object.fromEntries(
    (await progress(user)).map((row) => [
      row.workoutSessionId,
      row.completedSetCount,
    ])
  );

describe("Server-maintained Workout Session qualification", () => {
  it("tracks positive Set transitions, repeated edits, moves and deletes exactly once", async () => {
    const { user, sessions, exercises } = await seed();
    const [first, second] = sessions;
    const [exercise, destination] = exercises;
    expect(await counts(user)).toEqual({ [first.id]: 0, [second.id]: 0 });
    const empty = await addSet(user, exercise.id, null);
    await addSet(user, exercise.id, 0);
    const positive = await addSet(user, exercise.id, 8);
    expect(await counts(user)).toEqual({ [first.id]: 1, [second.id]: 0 });
    await asUser(user, async (tx) => {
      await tx
        .update(workoutSessionExerciseSets)
        .set({ repsCompleted: 12 })
        .where(eq(workoutSessionExerciseSets.id, positive.id));
      await tx
        .update(workoutSessionExerciseSets)
        .set({ repsCompleted: 4 })
        .where(eq(workoutSessionExerciseSets.id, empty.id));
    });
    expect(await counts(user)).toEqual({ [first.id]: 2, [second.id]: 0 });
    await asUser(user, (tx) =>
      tx
        .update(workoutSessionExerciseSets)
        .set({
          workoutSessionExerciseId: destination.id,
        })
        .where(eq(workoutSessionExerciseSets.id, positive.id))
    );
    expect(await counts(user)).toEqual({ [first.id]: 1, [second.id]: 1 });
    await asUser(user, (tx) =>
      tx
        .update(workoutSessionExerciseSets)
        .set({ repsCompleted: 0 })
        .where(eq(workoutSessionExerciseSets.id, empty.id))
    );
    await asUser(user, (tx) =>
      tx
        .delete(workoutSessionExerciseSets)
        .where(eq(workoutSessionExerciseSets.id, positive.id))
    );
    expect(await counts(user)).toEqual({ [first.id]: 0, [second.id]: 0 });
  });

  it("moves an Exercise's cached count and handles both cascade levels", async () => {
    const { user, sessions, exercises } = await seed();
    const [first, second] = sessions;
    const [exercise] = exercises;
    await addSet(user, exercise.id, 8);
    await addSet(user, exercise.id, 5);
    await asUser(user, (tx) =>
      tx
        .update(workoutSessionExercises)
        .set({
          workoutSessionId: second.id,
        })
        .where(eq(workoutSessionExercises.id, exercise.id))
    );
    expect(await counts(user)).toEqual({ [first.id]: 0, [second.id]: 2 });
    await asUser(user, (tx) =>
      tx
        .delete(workoutSessionExercises)
        .where(eq(workoutSessionExercises.id, exercise.id))
    );
    expect(await counts(user)).toEqual({ [first.id]: 0, [second.id]: 0 });
    await addSet(user, exercises[1].id, 3);
    await asUser(user, (tx) =>
      tx.delete(workoutSessions).where(eq(workoutSessions.id, second.id))
    );
    expect(await counts(user)).toEqual({ [first.id]: 0 });
  });

  it("follows Session metadata and keeps qualification User-owned", async () => {
    const { user, sessions, exercises } = await seed();
    const intruder = `user_progress${randomUUID().replaceAll("-", "")}`;
    users.push(intruder);
    await addSet(user, exercises[0].id, 8);
    await asUser(user, (tx) =>
      tx
        .update(workoutSessions)
        .set({ finishedAt: null, startedAt: "2026-10-30T10:00:00Z" })
        .where(eq(workoutSessions.id, sessions[0].id))
    );
    expect(
      (await progress(user)).find(
        (row) => row.workoutSessionId === sessions[0].id
      )
    ).toMatchObject({
      completedSetCount: 1,
      finishedAt: null,
      startedAt: "2026-10-30 10:00:00+00",
    });
    expect(await progress(intruder)).toEqual([]);
    await withService((tx) =>
      tx
        .update(workoutSessions)
        .set({ userId: intruder })
        .where(eq(workoutSessions.id, sessions[0].id))
    );
    expect(
      (await progress(intruder)).map((row) => row.completedSetCount)
    ).toEqual([1]);
    expect((await progress(user)).map((row) => row.workoutSessionId)).toEqual([
      sessions[1].id,
    ]);
  });

  it("rolls counters back with a rejected source transaction", async () => {
    const { user, sessions, exercises } = await seed();
    await expect(
      asUser(user, async (tx) => {
        await tx.insert(workoutSessionExerciseSets).values({
          order: 1,
          repsCompleted: 8,
          workoutSessionExerciseId: exercises[0].id,
        });
        throw new Error("roll back fixture");
      })
    ).rejects.toThrow("roll back fixture");
    expect(await counts(user)).toEqual({
      [sessions[0].id]: 0,
      [sessions[1].id]: 0,
    });
  });

  it("serializes concurrent Set increments and an Exercise move without losing counts", async () => {
    const { user, sessions, exercises } = await seed();
    await Promise.all(
      Array.from({ length: 8 }, () => addSet(user, exercises[0].id, 8))
    );
    expect(await counts(user)).toEqual({
      [sessions[0].id]: 8,
      [sessions[1].id]: 0,
    });
    await Promise.all([
      addSet(user, exercises[0].id, 8),
      asUser(user, (tx) =>
        tx
          .update(workoutSessionExercises)
          .set({ workoutSessionId: sessions[1].id })
          .where(eq(workoutSessionExercises.id, exercises[0].id))
      ),
    ]);
    expect(await counts(user)).toEqual({
      [sessions[0].id]: 0,
      [sessions[1].id]: 9,
    });
  });

  it("exposes no counter write or trigger-call permission to authenticated callers", async () => {
    const { user, sessions } = await seed();
    await expect(
      asUser(user, (tx) =>
        tx
          .update(workoutSessionProgress)
          .set({ completedSetCount: 999 })
          .where(eq(workoutSessionProgress.workoutSessionId, sessions[0].id))
      )
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      asUser(user, (tx) =>
        tx
          .delete(workoutSessionProgress)
          .where(eq(workoutSessionProgress.workoutSessionId, sessions[0].id))
      )
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await asUser(user, async (tx) => {
      const result = await tx.execute<{ allowed: boolean }>(
        sql`select has_function_privilege(current_user, p.oid, 'execute') as allowed
          from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'private' and p.proname = 'count_workout_session_progress'`
      );
      expect(result.rows[0].allowed).toBe(false);
    });
  });
});
