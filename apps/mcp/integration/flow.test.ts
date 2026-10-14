import { type MuscleGroup, muscleGroups } from "@fitme/core";
import { asUser, profiles } from "@fitme/db";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  callError,
  callOk,
  connectAs,
  createTestUser,
  type ExercisePage,
  type ExerciseRow,
  type PlanDetail,
  type PlanSummary,
  pickExercises,
  planInput,
  type SessionDetail,
  type SessionPage,
  type TestUser,
} from "./setup.js";

const isMuscleGroup = (value: string): value is MuscleGroup =>
  muscleGroups.some((group) => group === value);

/**
 * The main flow with one real user, in order: each step builds on the state
 * left by the previous one.
 */
describe("plan and workout flow against Supabase", () => {
  let user: TestUser;
  let client: Client;
  let exercises: readonly [ExerciseRow, ExerciseRow];
  let plan: PlanDetail;
  let otherPlan: PlanDetail;
  let session: SessionDetail;

  const workoutNamed = (detail: PlanDetail, name: string) => {
    const workout = detail.workouts.find((item) => item.name === name);
    if (!workout) {
      throw new Error(`Workout ${name} not in plan ${detail.id}`);
    }
    return workout;
  };

  beforeAll(async () => {
    user = createTestUser("flow");
    client = await connectAs(user);
    exercises = await pickExercises(client);
  });

  it("reads the profile written by onboarding", async () => {
    await callError(client, "get_profile");
    await asUser(user.userId, (tx) =>
      tx.insert(profiles).values({
        age: 30,
        gender: "female",
        height: "66",
        measurementSystem: "us",
        userId: user.userId,
        weight: "150",
      })
    );

    const profile = await callOk<Record<string, unknown>>(
      client,
      "get_profile"
    );
    expect(profile).toMatchObject({
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
    });
  });

  it("searches the exercise library and pages past the end", async () => {
    const [first] = exercises;
    const muscleGroup = first.muscle_groups?.find(isMuscleGroup);
    const found = await callOk<ExercisePage>(client, "list_exercises", {
      search: first.name,
      ...(muscleGroup ? { muscleGroup } : {}),
    });
    expect(found.exercises.map((row) => row.id)).toContain(first.id);

    const all = await callOk<ExercisePage>(client, "list_exercises", {
      limit: 1,
    });
    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(all.hasMore).toBe(true);

    // PostgREST answers this range with PGRST103; the tool returns a page.
    const pastEnd = await callOk<ExercisePage>(client, "list_exercises", {
      offset: all.total + 10,
    });
    expect(pastEnd).toMatchObject({
      exercises: [],
      hasMore: false,
      total: all.total,
    });

    const detail = await callOk<{ id: string }>(client, "get_exercise", {
      exerciseId: first.id,
    });
    expect(detail.id).toBe(first.id);
  });

  it("creates a plan with ordered workouts, exercises and sets", async () => {
    plan = await callOk<PlanDetail>(
      client,
      "create_plan",
      planInput(exercises)
    );

    expect(plan).toMatchObject({ is_active: true, name: "Integration plan" });
    expect(plan.workouts.map((workout) => workout.name)).toEqual([
      "Day A",
      "Day B",
    ]);
    const dayA = workoutNamed(plan, "Day A");
    expect(dayA.exercises.map((exercise) => exercise.exercise.id)).toEqual(
      exercises.map((exercise) => exercise.id)
    );
    expect(dayA.exercises[0]?.sets.map((set) => set.reps_recommended)).toEqual([
      8, 6,
    ]);
  });

  it("rejects unknown exercise ids without creating a plan", async () => {
    const input = planInput(exercises, "Broken plan");
    const unknownId = "00000000-0000-4000-8000-000000000000";
    const [dayA] = input.workouts;
    const message = await callError(client, "create_plan", {
      ...input,
      workouts: [
        {
          ...dayA,
          exercises: [{ ...dayA.exercises[0], exercise_id: unknownId }],
        },
      ],
    });
    expect(message).toContain(unknownId);
  });

  it("gets the plan it created", async () => {
    const fetched = await callOk<PlanDetail>(client, "get_plan", {
      planId: plan.id,
    });
    expect(fetched).toEqual(plan);
  });

  it("makes a newly created plan the only active one", async () => {
    otherPlan = await callOk<PlanDetail>(
      client,
      "create_plan",
      planInput(exercises, "Second plan")
    );

    const plans = await callOk<PlanSummary[]>(client, "list_plans");
    expect(plans.map((item) => [item.id, item.is_active])).toEqual([
      [otherPlan.id, true],
      [plan.id, false],
    ]);
    expect(plans[1]?.workouts.map((workout) => workout.exercise_count)).toEqual(
      [2, 1]
    );
  });

  it("updates metadata only, keeping workout ids", async () => {
    const updated = await callOk<PlanDetail>(client, "update_plan", {
      name: "Renamed plan",
      note: null,
      planId: plan.id,
    });

    expect(updated).toMatchObject({
      description: plan.description,
      is_active: false,
      name: "Renamed plan",
      note: null,
    });
    expect(updated.workouts).toEqual(plan.workouts);
    plan = updated;
  });

  it("activates a plan and deactivates the others", async () => {
    const { plan: summary } = await callOk<{ plan: PlanSummary }>(
      client,
      "activate_plan",
      { planId: plan.id }
    );
    expect(summary).toMatchObject({ id: plan.id, is_active: true });

    const plans = await callOk<PlanSummary[]>(client, "list_plans");
    expect(
      plans.filter((item) => item.is_active).map((item) => item.id)
    ).toEqual([plan.id]);
  });

  it("starts a session from a workout and resumes it", async () => {
    const dayA = workoutNamed(plan, "Day A");
    const started = await callOk<{ resumed: boolean; session: SessionDetail }>(
      client,
      "start_workout_session",
      { workoutId: dayA.id }
    );

    expect(started.resumed).toBe(false);
    ({ session } = started);
    expect(session).toMatchObject({
      finished_at: null,
      plan: { id: plan.id, name: plan.name },
      status: "in_progress",
      workout: { id: dayA.id, name: "Day A" },
    });
    expect(
      session.exercises.map((exercise) => [
        exercise.exercise.id,
        exercise.sets.map((set) => [
          set.reps_recommended,
          set.weight_recommended,
          set.logged_at,
        ]),
      ])
    ).toEqual(
      dayA.exercises.map((exercise) => [
        exercise.exercise.id,
        exercise.sets.map((set) => [
          set.reps_recommended,
          set.weight_recommended,
          null,
        ]),
      ])
    );

    const resumed = await callOk<{ resumed: boolean; session: SessionDetail }>(
      client,
      "start_workout_session",
      { workoutId: dayA.id }
    );
    expect(resumed).toEqual({ resumed: true, session });
  });

  it("logs a set and overwrites it when logged again", async () => {
    const setId = session.exercises[0]?.sets[0]?.id;
    await callOk(client, "log_set", {
      repsCompleted: 5,
      setId,
      weightCompleted: 50,
    });
    const logged = await callOk<Record<string, unknown>>(client, "log_set", {
      repsCompleted: 7,
      setId,
      weightCompleted: 62.5,
    });
    expect(logged).toMatchObject({
      id: setId,
      reps_completed: 7,
      weight_completed: 62.5,
    });
    expect(logged.logged_at).toEqual(expect.any(String));

    // A plan set id is not a session set id.
    await callError(client, "log_set", {
      repsCompleted: 1,
      setId: plan.workouts[0]?.exercises[0]?.sets[0]?.id,
      weightCompleted: 1,
    });
  });

  it("lists the open session as in progress", async () => {
    const open = await callOk<SessionPage>(client, "list_workout_sessions", {
      status: "in_progress",
    });
    expect(open.sessions).toEqual([
      expect.objectContaining({
        id: session.id,
        logged_set_count: 1,
        set_count: 3,
        status: "in_progress",
      }),
    ]);
  });

  it("finishes the session and rotates the workout", async () => {
    const finished = await callOk<{
      alreadyFinished: boolean;
      rotated: boolean;
      session: SessionDetail;
    }>(client, "finish_workout_session", { sessionId: session.id });
    expect(finished).toMatchObject({
      alreadyFinished: false,
      rotated: true,
      session: { id: session.id, status: "finished" },
    });

    const rotated = await callOk<PlanDetail>(client, "get_plan", {
      planId: plan.id,
    });
    expect(rotated.workouts.map((workout) => workout.name)).toEqual([
      "Day B",
      "Day A",
    ]);

    const again = await callOk<{ alreadyFinished: boolean; rotated: boolean }>(
      client,
      "finish_workout_session",
      { sessionId: session.id }
    );
    expect(again).toMatchObject({ alreadyFinished: true, rotated: false });

    const message = await callError(client, "log_set", {
      repsCompleted: 1,
      setId: session.exercises[0]?.sets[1]?.id,
      weightCompleted: 1,
    });
    expect(message).toContain("finished");
  });

  it("lists sessions by status and pages past the end", async () => {
    const finished = await callOk<SessionPage>(
      client,
      "list_workout_sessions",
      {
        status: "finished",
      }
    );
    expect(finished.sessions.map((item) => item.id)).toEqual([session.id]);

    const open = await callOk<SessionPage>(client, "list_workout_sessions", {
      status: "in_progress",
    });
    expect(open).toMatchObject({ sessions: [], total: 0 });

    const pastEnd = await callOk<SessionPage>(client, "list_workout_sessions", {
      offset: 5,
    });
    expect(pastEnd).toMatchObject({ hasMore: false, sessions: [], total: 1 });
  });

  it("returns the logged set in the exercise history", async () => {
    const [first] = exercises;
    const history = await callOk<{
      entries: { session_id: string; sets: Record<string, unknown>[] }[];
    }>(client, "get_exercise_history", { exerciseId: first.id });

    expect(history.entries).toEqual([
      expect.objectContaining({
        plan: { id: plan.id, name: plan.name },
        session_id: session.id,
        sets: [
          expect.objectContaining({
            reps_completed: 7,
            weight_completed: 62.5,
          }),
        ],
      }),
    ]);
  });

  it("replaces workouts and keeps past sessions' logged sets", async () => {
    const input = planInput(exercises);
    const replaced = await callOk<PlanDetail>(client, "update_plan", {
      planId: plan.id,
      workouts: [...input.workouts].reverse(),
    });

    expect(replaced.name).toBe("Renamed plan");
    expect(replaced.workouts.map((workout) => workout.name)).toEqual([
      "Day B",
      "Day A",
    ]);
    const oldIds = new Set(plan.workouts.map((workout) => workout.id));
    for (const workout of replaced.workouts) {
      expect(oldIds.has(workout.id)).toBe(false);
    }
    plan = replaced;

    const past = await callOk<SessionDetail>(client, "get_workout_session", {
      sessionId: session.id,
    });
    expect(past).toMatchObject({
      plan: { id: plan.id },
      status: "finished",
      workout: null,
    });
    expect(past.exercises[0]?.sets[0]).toMatchObject({
      reps_completed: 7,
      weight_completed: 62.5,
    });
  });

  it("finishes a session whose workout was replaced without rotating", async () => {
    const { session: open } = await callOk<{ session: SessionDetail }>(
      client,
      "start_workout_session",
      { workoutId: workoutNamed(plan, "Day A").id }
    );

    plan = await callOk<PlanDetail>(client, "update_plan", {
      planId: plan.id,
      workouts: planInput(exercises).workouts,
    });

    const finished = await callOk<{
      alreadyFinished: boolean;
      rotated: boolean;
      session: SessionDetail;
    }>(client, "finish_workout_session", { sessionId: open.id });
    expect(finished).toMatchObject({
      alreadyFinished: false,
      rotated: false,
      session: { id: open.id, status: "finished", workout: null },
    });

    const deleted = await callOk(client, "delete_workout_session", {
      sessionId: open.id,
    });
    expect(deleted).toEqual({ deleted: true, sessionId: open.id });
    await callError(client, "get_workout_session", { sessionId: open.id });
    await callError(client, "delete_workout_session", { sessionId: open.id });
  });

  it("soft-deletes a plan and hides it everywhere", async () => {
    const deleted = await callOk(client, "delete_plan", {
      planId: otherPlan.id,
    });
    expect(deleted).toEqual({
      alreadyDeleted: false,
      deleted: true,
      plan: { id: otherPlan.id, name: otherPlan.name },
    });

    const again = await callOk(client, "delete_plan", {
      planId: otherPlan.id,
    });
    expect(again).toMatchObject({ alreadyDeleted: true, deleted: true });

    await callError(client, "get_plan", { planId: otherPlan.id });
    await callError(client, "activate_plan", { planId: otherPlan.id });
    await callError(client, "update_plan", {
      name: "Revived",
      planId: otherPlan.id,
    });
    await callError(client, "start_workout_session", {
      workoutId: otherPlan.workouts[0]?.id,
    });

    const plans = await callOk<PlanSummary[]>(client, "list_plans");
    expect(plans.map((item) => item.id)).toEqual([plan.id]);
  });
});
