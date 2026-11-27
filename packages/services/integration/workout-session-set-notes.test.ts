import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import {
  asUser,
  plans,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessionProgress,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getExerciseHistory } from "../src/exercises";
import { applyPlanUpdate } from "../src/plan-update";
import {
  addSetToWorkoutSessionExercise,
  deleteWorkoutSession,
  finishWorkoutSession,
  getWorkoutSession,
  listWorkoutHistory,
  logSet,
  removeExerciseFromWorkoutSession,
  removeSetFromWorkoutSession,
  replaceExerciseInWorkoutSession,
  setWorkoutSessionSetNote,
  startWorkoutSession,
} from "../src/workout-sessions";
import type { SetWorkoutSessionSetNoteInput } from "../src/workout-sessions";
import { deleteTestUsers } from "./delete-test-users";

/**
 * setWorkoutSessionSetNote, and the note on every set read, through asUser
 * against a local Supabase stack via the Supavisor pooler as the fitme login.
 * Made-up Clerk-style User ids, unique per run; a fresh User per Workout
 * Session, since a User has at most one open.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const users: string[] = [];
const intruder = `user_svcSetNoteIntruder${runId}`;

/** Long enough for a transaction waiting on a lock to have queued there. */
const QUEUE_HEAD_START_MS = 200;

const newUser = () => {
  const user = `user_svcSetNote${users.length}x${runId}`;
  users.push(user);

  return user;
};

const slugOf = (name: string) => `test-setnote-${name}-${runId}`;

interface SeededSession {
  exerciseId: string;
  loggedSetId: string;
  sessionId: string;
  unloggedSetId: string;
  userId: string;
}

/**
 * A Workout Session of a new User with one Exercise and two sets: one logged
 * (8 × 60), one not.
 */
const seedSession = async ({
  finished = false,
}: { finished?: boolean } = {}): Promise<SeededSession> => {
  const userId = newUser();

  return await withService(async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        finishedAt: finished ? "2026-10-01T11:00:00Z" : null,
        startedAt: "2026-10-01T10:00:00Z",
        userId,
      })
      .returning({ id: workoutSessions.id });

    const [exercise] = await tx
      .insert(workoutSessionExercises)
      .values({
        exerciseSlug: slugOf("bench"),
        order: 1,
        workoutSessionId: session.id,
      })
      .returning({ id: workoutSessionExercises.id });

    const [logged, unlogged] = await tx
      .insert(workoutSessionExerciseSets)
      .values([
        {
          loggedAt: "2026-10-01T10:30:00Z",
          order: 1,
          repsCompleted: 8,
          repsRecommended: 8,
          restRecommended: 90,
          weightCompleted: "60.00",
          weightRecommended: "60.00",
          workoutSessionExerciseId: exercise.id,
        },
        {
          order: 2,
          repsRecommended: 8,
          restRecommended: 90,
          weightRecommended: "60.00",
          workoutSessionExerciseId: exercise.id,
        },
      ])
      .returning({ id: workoutSessionExerciseSets.id });

    return {
      exerciseId: exercise.id,
      loggedSetId: logged.id,
      sessionId: session.id,
      unloggedSetId: unlogged.id,
      userId,
    };
  });
};

const setNote = async (userId: string, input: SetWorkoutSessionSetNoteInput) =>
  await asUser(
    userId,
    async (tx) => await setWorkoutSessionSetNote(tx, userId, input)
  );

/** The set's row, read past RLS. */
const setRow = async (setId: string) =>
  await withService(async (tx) => {
    const [row] = await tx
      .select()
      .from(workoutSessionExerciseSets)
      .where(eq(workoutSessionExerciseSets.id, setId));

    return row;
  });

const noteOf = async (setId: string) => {
  const row = await setRow(setId);

  return row.note;
};

const sessionState = async (sessionId: string) =>
  await withService(async (tx) => {
    const [session] = await tx
      .select({ finishedAt: workoutSessions.finishedAt })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));

    const [progress] = await tx
      .select({ completedSetCount: workoutSessionProgress.completedSetCount })
      .from(workoutSessionProgress)
      .where(eq(workoutSessionProgress.workoutSessionId, sessionId));

    return { progress, session };
  });

/** Everything about a set but its note and bookkeeping timestamps. */
const loggedValues = (row: Awaited<ReturnType<typeof setRow>>) => ({
  loggedAt: row.loggedAt,
  order: row.order,
  repsCompleted: row.repsCompleted,
  repsRecommended: row.repsRecommended,
  restRecommended: row.restRecommended,
  weightCompleted: row.weightCompleted,
  weightRecommended: row.weightRecommended,
  workoutSessionExerciseId: row.workoutSessionExerciseId,
});

/** A Plan of a new User whose one Workout has bench with one set. */
const seedPlan = async () => {
  const userId = newUser();

  const workoutId = await withService(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({ frequency: 3, name: "Notes plan", userId })
      .returning({ id: plans.id });

    const [workout] = await tx
      .insert(workouts)
      .values({ description: "", name: "Day A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });

    const [exercise] = await tx
      .insert(workoutExercises)
      .values({
        exerciseSlug: slugOf("bench"),
        order: 1,
        workoutId: workout.id,
      })
      .returning({ id: workoutExercises.id });

    await tx.insert(workoutExerciseSets).values({
      order: 1,
      repsRecommended: 8,
      restRecommended: 90,
      weightRecommended: "60",
      workoutExerciseId: exercise.id,
    });

    return workout.id;
  });

  return { userId, workoutId };
};

describe("notes on logged sets", () => {
  afterAll(async () => {
    await deleteTestUsers([...users, intruder]);
  });

  describe("writing", () => {
    it("writes, changes and clears a note on an open Workout Session", async () => {
      const { loggedSetId, userId } = await seedSession();

      const written = await setNote(userId, {
        note: "  Felt easy\nadd 2.5  ",
        setId: loggedSetId,
      });

      expect(written).toStrictEqual({
        set: {
          id: loggedSetId,
          logged_at: expect.any(String),
          note: "Felt easy\nadd 2.5",
          order: 1,
          reps_completed: 8,
          reps_recommended: 8,
          rest_recommended: 90,
          weight_completed: 60,
          weight_recommended: 60,
        },
        status: "saved",
      });

      const changed = await setNote(userId, {
        note: "Grip slipped",
        setId: loggedSetId,
      });

      expect(changed).toMatchObject({
        set: { note: "Grip slipped" },
        status: "saved",
      });
      await expect(noteOf(loggedSetId)).resolves.toBe("Grip slipped");

      const cleared = await setNote(userId, {
        note: "   ",
        setId: loggedSetId,
      });

      expect(cleared).toMatchObject({ set: { note: null }, status: "saved" });
      await expect(noteOf(loggedSetId)).resolves.toBeNull();
    });

    it("writes and clears a note on a finished Workout Session", async () => {
      const { loggedSetId, userId } = await seedSession({ finished: true });

      await expect(
        setNote(userId, { note: "Last rep slow", setId: loggedSetId })
      ).resolves.toMatchObject({
        set: { note: "Last rep slow" },
        status: "saved",
      });
      await expect(
        setNote(userId, { note: "", setId: loggedSetId })
      ).resolves.toMatchObject({ set: { note: null }, status: "saved" });
      await expect(noteOf(loggedSetId)).resolves.toBeNull();
    });

    it("counts a bodyweight set, which logs reps and no weight, as logged", async () => {
      const { exerciseId, userId } = await seedSession();

      const [bodyweight] = await withService((tx) =>
        tx
          .insert(workoutSessionExerciseSets)
          .values({
            loggedAt: "2026-10-01T10:40:00Z",
            order: 3,
            repsCompleted: 12,
            workoutSessionExerciseId: exerciseId,
          })
          .returning({ id: workoutSessionExerciseSets.id })
      );

      await expect(
        setNote(userId, { note: "Strict form", setId: bodyweight.id })
      ).resolves.toMatchObject({
        set: { note: "Strict form", weight_completed: null },
        status: "saved",
      });
    });

    it("answers not logged for a set without reps, blank text or not, and writes nothing", async () => {
      const { unloggedSetId, userId } = await seedSession();

      await expect(
        setNote(userId, { note: "Too early", setId: unloggedSetId })
      ).resolves.toStrictEqual({ status: "not_logged" });
      await expect(
        setNote(userId, { note: "  ", setId: unloggedSetId })
      ).resolves.toStrictEqual({ status: "not_logged" });
      await expect(noteOf(unloggedSetId)).resolves.toBeNull();
    });

    it("answers not found for a missing set and another User's, and writes nothing", async () => {
      const { loggedSetId } = await seedSession();

      await expect(
        setNote(intruder, { note: "Mine now", setId: loggedSetId })
      ).resolves.toStrictEqual({ status: "not_found" });
      await expect(
        setNote(intruder, { note: "Mine now", setId: randomUUID() })
      ).resolves.toStrictEqual({ status: "not_found" });
      await expect(noteOf(loggedSetId)).resolves.toBeNull();
    });

    it("refuses text that can't be a note without touching the database", async () => {
      const { loggedSetId, userId } = await seedSession();

      await expect(
        setNote(userId, {
          note: "x".repeat(MAX_NOTE_LENGTH + 1),
          setId: loggedSetId,
        })
      ).resolves.toStrictEqual({ reason: "too_long", status: "invalid" });
      await expect(
        setNote(userId, { note: "a\u0000b", setId: loggedSetId })
      ).resolves.toStrictEqual({ reason: "nul", status: "invalid" });
      await expect(noteOf(loggedSetId)).resolves.toBeNull();
    });

    it("changes only the note", async () => {
      const { loggedSetId, sessionId, userId } = await seedSession({
        finished: true,
      });

      const rowBefore = await setRow(loggedSetId);
      const stateBefore = await sessionState(sessionId);

      await setNote(userId, { note: "Only this", setId: loggedSetId });

      const rowAfter = await setRow(loggedSetId);

      expect(rowAfter.note).toBe("Only this");
      expect(loggedValues(rowAfter)).toStrictEqual(loggedValues(rowBefore));
      await expect(sessionState(sessionId)).resolves.toStrictEqual(stateBefore);
    });
  });

  describe("the expected note", () => {
    it("writes while the note is the expected one, and answers the present note otherwise", async () => {
      const { loggedSetId, userId } = await seedSession();

      await expect(
        setNote(userId, {
          expectedNote: null,
          note: "First",
          setId: loggedSetId,
        })
      ).resolves.toMatchObject({ set: { note: "First" }, status: "saved" });

      await expect(
        setNote(userId, {
          expectedNote: "Something else",
          note: "Second",
          setId: loggedSetId,
        })
      ).resolves.toStrictEqual({ note: "First", status: "conflict" });

      await expect(
        setNote(userId, {
          expectedNote: "  ",
          note: "Second",
          setId: loggedSetId,
        })
      ).resolves.toStrictEqual({ note: "First", status: "conflict" });

      await expect(
        setNote(userId, {
          expectedNote: "First",
          note: "Second",
          setId: loggedSetId,
        })
      ).resolves.toMatchObject({ set: { note: "Second" }, status: "saved" });

      await expect(noteOf(loggedSetId)).resolves.toBe("Second");
    });

    it("saves when the note is already the new text, whatever was expected", async () => {
      const { loggedSetId, userId } = await seedSession();

      await setNote(userId, { note: "Second", setId: loggedSetId });

      // Already the new text: saved, whatever was expected.
      await expect(
        setNote(userId, {
          expectedNote: "Stale",
          note: "Second",
          setId: loggedSetId,
        })
      ).resolves.toMatchObject({ set: { note: "Second" }, status: "saved" });

      await expect(noteOf(loggedSetId)).resolves.toBe("Second");
    });

    it("lets one of two saves expecting the same note win", async () => {
      const { loggedSetId, userId } = await seedSession();

      const results = await Promise.all(
        ["Left", "Right"].map(
          async (note) =>
            await setNote(userId, {
              expectedNote: null,
              note,
              setId: loggedSetId,
            })
        )
      );

      const saved = results.filter((result) => result.status === "saved");

      const conflicts = results.filter(
        (result) => result.status === "conflict"
      );

      expect(saved).toHaveLength(1);
      expect(conflicts).toHaveLength(1);

      const stored = await noteOf(loggedSetId);

      expect(saved[0]).toMatchObject({ set: { note: stored } });
      expect(conflicts[0]).toStrictEqual({ note: stored, status: "conflict" });
    });
  });

  describe("locks", () => {
    it("queues behind a finish holding the Workout Session, then writes on the finished one", async () => {
      const { loggedSetId, sessionId, userId } = await seedSession();

      let releaseFinish = () => {};

      const finishHeld = new Promise<void>((resolve) => {
        releaseFinish = resolve;
      });

      let finishing = () => {};

      const finishStarted = new Promise<void>((resolve) => {
        finishing = resolve;
      });

      const finish = asUser(userId, async (tx) => {
        const result = await finishWorkoutSession(tx, sessionId);
        finishing();
        await finishHeld;

        return result;
      });

      await finishStarted;

      let noteDone = false;

      const note = setNote(userId, {
        note: "After finishing",
        setId: loggedSetId,
      }).then((result) => {
        noteDone = true;

        return result;
      });

      await setTimeout(QUEUE_HEAD_START_MS);
      expect(noteDone).toBeFalsy();

      releaseFinish();

      await expect(finish).resolves.toMatchObject({ status: "finished" });
      await expect(note).resolves.toMatchObject({
        set: { note: "After finishing" },
        status: "saved",
      });
    });
  });

  describe("what the note survives", () => {
    it("survives a reps or weight edit, replacing the Exercise, finishing and applying a Plan Update", async () => {
      const { userId, workoutId } = await seedPlan();

      const started = await asUser(
        userId,
        async (tx) => await startWorkoutSession(tx, workoutId)
      );

      if (started.status !== "started") {
        throw new Error(`Expected a session, got ${started.status}`);
      }

      const sessionId = started.session.id;
      const [exercise] = started.session.exercises;
      const [planSet] = exercise.sets;

      await asUser(
        userId,
        async (tx) =>
          await logSet(tx, {
            repsCompleted: 8,
            setId: planSet.id,
            weightCompleted: 60,
          })
      );
      await setNote(userId, { note: "Plan set note", setId: planSet.id });

      // A set added during the session: the Plan Update copies it into the Plan.
      const added = await asUser(
        userId,
        async (tx) =>
          await addSetToWorkoutSessionExercise(tx, userId, {
            repsCompleted: 10,
            sessionExerciseId: exercise.id,
            weightCompleted: 50,
          })
      );

      if (added.status !== "added") {
        throw new Error(`Expected an added set, got ${added.status}`);
      }

      await setNote(userId, { note: "Added set note", setId: added.set.id });

      await asUser(
        userId,
        async (tx) =>
          await logSet(tx, {
            repsCompleted: 6,
            setId: planSet.id,
            weightCompleted: 65,
          })
      );
      const afterEdit = await noteOf(planSet.id);

      await asUser(
        userId,
        async (tx) =>
          await replaceExerciseInWorkoutSession(tx, userId, {
            exerciseSlug: slugOf("incline"),
            sessionExerciseId: exercise.id,
          })
      );
      const afterReplace = await noteOf(planSet.id);

      await asUser(
        userId,
        async (tx) =>
          await replaceExerciseInWorkoutSession(tx, userId, {
            exerciseSlug: slugOf("bench"),
            sessionExerciseId: exercise.id,
          })
      );

      await expect(
        asUser(userId, async (tx) => await finishWorkoutSession(tx, sessionId))
      ).resolves.toMatchObject({ status: "finished" });
      const afterFinish = await noteOf(planSet.id);

      const applied = await asUser(
        userId,
        async (tx) => await applyPlanUpdate(tx, userId, sessionId)
      );

      expect(applied?.changes).toContainEqual(
        expect.objectContaining({ kind: "add_sets" })
      );
      expect({
        afterApply: await noteOf(planSet.id),
        afterEdit,
        afterFinish,
        afterReplace,
        addedAfterApply: await noteOf(added.set.id),
      }).toStrictEqual({
        afterApply: "Plan set note",
        afterEdit: "Plan set note",
        afterFinish: "Plan set note",
        afterReplace: "Plan set note",
        addedAfterApply: "Added set note",
      });
    });
  });

  describe("what the note goes with", () => {
    it("goes with its set", async () => {
      const { loggedSetId, userId } = await seedSession();

      await setNote(userId, { note: "Doomed", setId: loggedSetId });
      await asUser(
        userId,
        async (tx) => await removeSetFromWorkoutSession(tx, userId, loggedSetId)
      );

      await expect(setRow(loggedSetId)).resolves.toBeUndefined();
    });

    it("goes with its Exercise", async () => {
      const { exerciseId, loggedSetId, userId } = await seedSession();

      await setNote(userId, { note: "Doomed", setId: loggedSetId });
      await asUser(
        userId,
        async (tx) =>
          await removeExerciseFromWorkoutSession(tx, userId, exerciseId)
      );

      await expect(setRow(loggedSetId)).resolves.toBeUndefined();
    });

    it.each([
      { finished: false, kind: "a discarded open" },
      { finished: true, kind: "a deleted finished" },
    ])("goes with $kind Workout Session", async ({ finished }) => {
      const { loggedSetId, sessionId, userId } = await seedSession({
        finished,
      });

      await setNote(userId, { note: "Doomed", setId: loggedSetId });
      await asUser(
        userId,
        async (tx) => await deleteWorkoutSession(tx, sessionId)
      );

      await expect(setRow(loggedSetId)).resolves.toBeUndefined();
    });
  });

  describe("reads", () => {
    it("carries the note on one Workout Session, finished history and Exercise history", async () => {
      const { loggedSetId, sessionId, unloggedSetId, userId } =
        await seedSession({ finished: true });

      await setNote(userId, { note: "Read me", setId: loggedSetId });

      const session = await asUser(
        userId,
        async (tx) => await getWorkoutSession(tx, sessionId)
      );

      expect(
        session?.exercises[0].sets.map(({ id, note }) => ({ id, note }))
      ).toStrictEqual([
        { id: loggedSetId, note: "Read me" },
        { id: unloggedSetId, note: null },
      ]);

      const history = await asUser(
        userId,
        async (tx) => await listWorkoutHistory(tx, { limit: 5 })
      );

      expect(history[0].exercises[0].sets[0]).toMatchObject({
        id: loggedSetId,
        note: "Read me",
      });

      const exerciseHistory = await asUser(
        userId,
        async (tx) =>
          await getExerciseHistory(tx, userId, {
            exerciseSlug: slugOf("bench"),
            limit: 5,
            offset: 0,
          })
      );

      expect(exerciseHistory.entries[0].sets).toStrictEqual([
        expect.objectContaining({ id: loggedSetId, note: "Read me" }),
      ]);
    });
  });
});
