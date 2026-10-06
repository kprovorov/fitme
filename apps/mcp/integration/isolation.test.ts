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
} from "./setup.js";

/**
 * Two real users: everything the intruder does with the owner's ids must fail
 * (RLS hides the rows), and the owner's data must be left untouched.
 */
describe("cross-user isolation against Supabase", () => {
  let owner: Client;
  let intruder: Client;
  let exercises: readonly [ExerciseRow, ExerciseRow];
  let plan: PlanDetail;
  let session: SessionDetail;

  const ownerSetId = () => session.exercises[0]?.sets[0]?.id;

  beforeAll(async () => {
    const [ownerUser, intruderUser] = await Promise.all([
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
