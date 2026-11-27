import {
  asUser,
  exerciseNotes,
  plans,
  workoutSessionExerciseSets,
  workoutSessions,
} from "@fitme/db";
import type { Transaction } from "@fitme/db";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  callError,
  callOk,
  connectAs,
  createTestUser,
  pickExercises,
  planInput,
} from "./setup.js";
import type {
  ExerciseRow,
  PlanDetail,
  PlanSummary,
  SessionDetail,
  SessionPage,
  TestUser,
} from "./setup.js";

/**
 * Two real users: everything the intruder does with the owner's ids must fail
 * (RLS hides the rows), and the owner's data must be left untouched.
 */
const OWNER_NOTE = "Seat on hole 4";
const OWNER_SET_NOTE = "Grip slipped";

describe("cross-user isolation against the local stack", () => {
  let owner: Client;
  let intruder: Client;
  let intruderUser: TestUser;
  let ownerUserId: string;
  let exercises: readonly [ExerciseRow, ExerciseRow];
  let plan: PlanDetail;
  let session: SessionDetail;

  const ownerSetId = () => session.exercises[0]?.sets[0]?.id;

  const asIntruder = <T>(fn: (tx: Transaction) => Promise<T>) =>
    asUser(intruderUser.userId, fn);

  beforeAll(async () => {
    const ownerUser = createTestUser("owner");
    ownerUserId = ownerUser.userId;
    intruderUser = createTestUser("intruder");
    owner = await connectAs(ownerUser);
    intruder = await connectAs(intruderUser);
    exercises = await pickExercises(owner);

    plan = await callOk<PlanDetail>(
      owner,
      "create_plan",
      planInput(exercises, "Owner plan")
    );
    ({ session } = await callOk<{ session: SessionDetail }>(
      owner,
      "start_workout_session",
      { workoutId: plan.workouts[0]?.id }
    ));
    await callOk(owner, "log_set", {
      repsCompleted: 5,
      setId: ownerSetId(),
      weightCompleted: 40,
    });
    await callOk(owner, "set_exercise_note", {
      exerciseSlug: exercises[0].slug,
      expectedNote: "",
      note: OWNER_NOTE,
    });
    await callOk(owner, "set_workout_session_set_note", {
      expectedNote: "",
      note: OWNER_SET_NOTE,
      setId: ownerSetId(),
    });
  });

  it("does not let another user see the owner's data", async () => {
    await expect(
      callOk<PlanSummary[]>(intruder, "list_plans")
    ).resolves.toStrictEqual([]);
    await expect(
      callOk<SessionPage>(intruder, "list_workout_sessions")
    ).resolves.toMatchObject({ sessions: [], total: 0 });
    await expect(
      callOk(intruder, "get_exercise_history", {
        exerciseSlug: exercises[0].slug,
      })
    ).resolves.toMatchObject({ entries: [] });
    await expect(
      callOk(intruder, "list_exercise_notes")
    ).resolves.toStrictEqual({ notes: [] });

    await callError(intruder, "get_plan", { planId: plan.id });
    await expect(
      callError(intruder, "get_workout_session", {
        sessionId: session.id,
      })
    ).resolves.toBeTypeOf("string");
  });

  it("does not let another user change the owner's plan", async () => {
    await callError(intruder, "update_plan", {
      name: "Hijacked",
      planId: plan.id,
    });
    await callError(intruder, "update_plan", {
      planId: plan.id,
      workouts: planInput(exercises).workouts,
    });
    await callError(intruder, "activate_plan", { planId: plan.id });
    await callError(intruder, "delete_plan", { planId: plan.id });
    await expect(
      callError(intruder, "start_workout_session", {
        workoutId: plan.workouts[1]?.id,
      })
    ).resolves.toBeTypeOf("string");
  });

  it("does not let another user change the owner's session", async () => {
    await callError(intruder, "log_set", {
      repsCompleted: 99,
      setId: ownerSetId(),
      weightCompleted: 999,
    });
    await expect(
      callError(intruder, "remove_set_from_workout_session", {
        setId: ownerSetId(),
      })
    ).resolves.toContain("not found");
    await callError(intruder, "finish_workout_session", {
      sessionId: session.id,
    });
    await expect(
      callError(intruder, "delete_workout_session", {
        sessionId: session.id,
      })
    ).resolves.toBeTypeOf("string");
  });

  it("keeps each user's Exercise notes separate", async () => {
    const intruderNote = await callOk(intruder, "set_exercise_note", {
      exerciseSlug: exercises[0].slug,
      expectedNote: OWNER_NOTE,
      note: "",
    });

    expect(intruderNote).toStrictEqual({ note: null });

    await callOk(intruder, "set_exercise_note", {
      exerciseSlug: exercises[0].slug,
      expectedNote: "",
      note: "Intruder's own note",
    });

    const updated = await asIntruder((tx) =>
      tx
        .update(exerciseNotes)
        .set({ note: "Hijacked" })
        .where(eq(exerciseNotes.userId, ownerUserId))
        .returning({ note: exerciseNotes.note })
    );

    expect(updated).toStrictEqual([]);

    const deleted = await asIntruder((tx) =>
      tx
        .delete(exerciseNotes)
        .where(eq(exerciseNotes.userId, ownerUserId))
        .returning({ note: exerciseNotes.note })
    );

    expect(deleted).toStrictEqual([]);
  });

  it("shows each user only their own Exercise note in reads", async () => {
    const [{ slug }] = exercises;

    const ownerPlan = await callOk<PlanDetail>(owner, "get_plan", {
      planId: plan.id,
    });

    expect(ownerPlan.workouts[0]?.exercises[0]).toMatchObject({
      exercise_note: OWNER_NOTE,
      exercise_slug: slug,
    });
    await expect(
      callOk(owner, "get_exercise", { exerciseSlug: slug })
    ).resolves.toMatchObject({ exercise_note: OWNER_NOTE });
    await expect(
      callOk(intruder, "get_exercise", { exerciseSlug: slug })
    ).resolves.toMatchObject({ exercise_note: "Intruder's own note" });
    await expect(
      callOk(intruder, "get_exercise_history", { exerciseSlug: slug })
    ).resolves.toMatchObject({
      entries: [],
      exercise_note: "Intruder's own note",
    });

    const ownerSession = await callOk<SessionDetail>(
      owner,
      "get_workout_session",
      { sessionId: session.id }
    );

    expect(ownerSession.exercises[0]).toMatchObject({
      exercise_note: OWNER_NOTE,
      exercise_slug: slug,
    });
  });

  it("does not let another user note the owner's set", async () => {
    await expect(
      callError(intruder, "set_workout_session_set_note", {
        expectedNote: OWNER_SET_NOTE,
        note: "Hijacked",
        setId: ownerSetId(),
      })
    ).resolves.toContain("not found");

    const updated = await asIntruder((tx) =>
      tx
        .update(workoutSessionExerciseSets)
        .set({ note: "Hijacked" })
        .where(eq(workoutSessionExerciseSets.id, ownerSetId() ?? ""))
        .returning({ id: workoutSessionExerciseSets.id })
    );

    expect(updated).toStrictEqual([]);
  });

  // The tools check ownership with a SELECT first, so also go straight to the
  // database as the intruder: the RLS write policies must refuse on their own.
  it("refuses the owner's ids in table writes", async () => {
    const workoutId = plan.workouts[1]?.id ?? "";

    const updatedPlans = await asIntruder((tx) =>
      tx
        .update(plans)
        .set({ name: "Hijacked" })
        .where(eq(plans.id, plan.id))
        .returning({ id: plans.id })
    );

    expect(updatedPlans).toStrictEqual([]);

    const updatedSets = await asIntruder((tx) =>
      tx
        .update(workoutSessionExerciseSets)
        .set({ repsCompleted: 99 })
        .where(eq(workoutSessionExerciseSets.id, ownerSetId() ?? ""))
        .returning({ id: workoutSessionExerciseSets.id })
    );

    expect(updatedSets).toStrictEqual([]);

    const deletedSets = await asIntruder((tx) =>
      tx
        .delete(workoutSessionExerciseSets)
        .where(eq(workoutSessionExerciseSets.id, ownerSetId() ?? ""))
        .returning({ id: workoutSessionExerciseSets.id })
    );

    expect(deletedSets).toStrictEqual([]);

    const deletedSessions = await asIntruder((tx) =>
      tx
        .delete(workoutSessions)
        .where(eq(workoutSessions.id, session.id))
        .returning({ id: workoutSessions.id })
    );

    expect(deletedSessions).toStrictEqual([]);

    // A session of the intruder's own that points at the owner's workout.
    // 42501: rejected by the policy's WITH CHECK, not by anything else.
    await expect(
      asIntruder((tx) =>
        tx.insert(workoutSessions).values({
          planId: plan.id,
          startedAt: new Date().toISOString(),
          userId: intruderUser.userId,
          workoutId,
        })
      )
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("keeps each user's active plan separate", async () => {
    const intruderPlan = await callOk<PlanDetail>(
      intruder,
      "create_plan",
      planInput(exercises, "Intruder plan")
    );

    expect(intruderPlan.is_active).toBeTruthy();

    const ownerPlans = await callOk<PlanSummary[]>(owner, "list_plans");
    expect(ownerPlans.map((item) => [item.id, item.is_active])).toStrictEqual([
      [plan.id, true],
    ]);
    await expect(
      callError(owner, "get_plan", { planId: intruderPlan.id })
    ).resolves.toBeTypeOf("string");
  });

  it("leaves the owner's Exercise note untouched", async () => {
    await expect(callOk(owner, "list_exercise_notes")).resolves.toStrictEqual({
      notes: [
        expect.objectContaining({
          exercise_slug: exercises[0].slug,
          note: OWNER_NOTE,
        }),
      ],
    });
  });

  it("leaves the owner's plan and session untouched", async () => {
    // as created, but for the Exercise note the owner wrote since
    await expect(
      callOk(owner, "get_plan", { planId: plan.id })
    ).resolves.toStrictEqual({
      ...plan,
      workouts: plan.workouts.map((workout) => ({
        ...workout,
        exercises: workout.exercises.map((exercise) => ({
          ...exercise,
          exercise_note:
            exercise.exercise_slug === exercises[0].slug ? OWNER_NOTE : null,
        })),
      })),
    });

    const current = await callOk<SessionDetail>(owner, "get_workout_session", {
      sessionId: session.id,
    });

    expect(current).toMatchObject({
      finished_at: null,
      status: "in_progress",
      workout: { id: plan.workouts[0]?.id },
    });
    expect(current.exercises[0]?.sets[0]).toMatchObject({
      note: OWNER_SET_NOTE,
      reps_completed: 5,
      weight_completed: 40,
    });
  });
});
