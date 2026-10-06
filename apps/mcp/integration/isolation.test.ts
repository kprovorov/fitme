import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  callError,
  callOk,
  connectAs,
  createTestUser,
  type ExerciseRow,
  type PlanDetail,
  type PlanSummary,
  pickExercises,
  planInput,
  type SessionDetail,
  type SessionPage,
  type TestUser,
} from "./setup.js";

/**
 * Two real users: everything the intruder does with the owner's ids must fail
 * (RLS hides the rows), and the owner's data must be left untouched.
 */
describe("cross-user isolation against Supabase", () => {
  let owner: Client;
  let intruder: Client;
  let intruderUser: TestUser;
  let exercises: readonly [ExerciseRow, ExerciseRow];
  let plan: PlanDetail;
  let session: SessionDetail;

  const ownerSetId = () => session.exercises[0]?.sets[0]?.id;

  beforeAll(async () => {
    let ownerUser: TestUser;
    [ownerUser, intruderUser] = await Promise.all([
      createTestUser("owner"),
      createTestUser("intruder"),
    ]);
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
  });

  it("does not let another user see the owner's data", async () => {
    expect(await callOk<PlanSummary[]>(intruder, "list_plans")).toEqual([]);
    expect(
      await callOk<SessionPage>(intruder, "list_workout_sessions")
    ).toMatchObject({ sessions: [], total: 0 });
    expect(
      await callOk(intruder, "get_exercise_history", {
        exerciseId: exercises[0].id,
      })
    ).toMatchObject({ entries: [] });

    await callError(intruder, "get_plan", { planId: plan.id });
    await callError(intruder, "get_workout_session", {
      sessionId: session.id,
    });
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
    await callError(intruder, "start_workout_session", {
      workoutId: plan.workouts[1]?.id,
    });
  });

  it("does not let another user change the owner's session", async () => {
    await callError(intruder, "log_set", {
      repsCompleted: 99,
      setId: ownerSetId(),
      weightCompleted: 999,
    });
    await callError(intruder, "finish_workout_session", {
      sessionId: session.id,
    });
    await callError(intruder, "delete_workout_session", {
      sessionId: session.id,
    });
  });

  // The tools check ownership with a SELECT first, so also go straight to the
  // database: the RPCs and the RLS write policies must refuse on their own.
  it("refuses the owner's ids in the RPCs and table writes", async () => {
    const db = intruderUser.supabase;
    const workoutId = plan.workouts[1]?.id ?? "";

    const rpcs = await Promise.all([
      db.rpc("activate_plan", { plan_id: plan.id }),
      db.rpc("update_plan", {
        p_plan_data: planInput(exercises, "Hijacked"),
        p_plan_id: plan.id,
      }),
      db.rpc("start_workout_session", { p_workout_id: workoutId }),
      db.rpc("finish_workout_session", { p_session_id: session.id }),
    ]);
    for (const { error } of rpcs) {
      expect(error).not.toBeNull();
    }

    const updatedPlans = await db
      .from("plans")
      .update({ name: "Hijacked" })
      .eq("id", plan.id)
      .select("id");
    expect(updatedPlans).toMatchObject({ data: [], error: null });

    const updatedSets = await db
      .from("workout_session_exercise_sets")
      .update({ reps_completed: 99 })
      .eq("id", ownerSetId() ?? "")
      .select("id");
    expect(updatedSets).toMatchObject({ data: [], error: null });

    const deletedSessions = await db
      .from("workout_sessions")
      .delete()
      .eq("id", session.id)
      .select("id");
    expect(deletedSessions).toMatchObject({ data: [], error: null });

    // A session of the intruder's own that points at the owner's workout.
    const inserted = await db.from("workout_sessions").insert({
      plan_id: plan.id,
      started_at: new Date().toISOString(),
      user_id: intruderUser.userId,
      workout_id: workoutId,
    });
    // 42501: rejected by the policy's WITH CHECK, not by anything else.
    expect(inserted.error?.code).toBe("42501");
  });

  it("keeps each user's active plan separate", async () => {
    const intruderPlan = await callOk<PlanDetail>(
      intruder,
      "create_plan",
      planInput(exercises, "Intruder plan")
    );
    expect(intruderPlan.is_active).toBe(true);

    const ownerPlans = await callOk<PlanSummary[]>(owner, "list_plans");
    expect(ownerPlans.map((item) => [item.id, item.is_active])).toEqual([
      [plan.id, true],
    ]);
    await callError(owner, "get_plan", { planId: intruderPlan.id });
  });

  it("leaves the owner's plan and session untouched", async () => {
    expect(await callOk(owner, "get_plan", { planId: plan.id })).toEqual(plan);

    const current = await callOk<SessionDetail>(owner, "get_workout_session", {
      sessionId: session.id,
    });
    expect(current).toMatchObject({
      finished_at: null,
      status: "in_progress",
      workout: { id: plan.workouts[0]?.id },
    });
    expect(current.exercises[0]?.sets[0]).toMatchObject({
      reps_completed: 5,
      weight_completed: 40,
    });
  });
});
