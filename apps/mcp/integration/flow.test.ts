/// <reference lib="es2023.array" />

import { muscleGroups } from "@fitme/core";
import type { MuscleGroup } from "@fitme/core";
import { asUser, profiles } from "@fitme/db";
import type { ExerciseHistoryPage } from "@fitme/services/exercises";
import type { ProfileWithUnits } from "@fitme/services/profile";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { beforeAll, describe, expect, it } from "vitest";

import { call } from "../src/__tests__/harness.js";
import {
  callError,
  callOk,
  connectAs,
  createTestUser,
  INTEGRATION_COVERS,
  pickExercises,
  planInput,
} from "./setup.js";
import type {
  ExercisePage,
  ExerciseRow,
  PlanDetail,
  PlanSummary,
  SessionDetail,
  SessionPage,
  SessionSet,
  TestUser,
} from "./setup.js";

const isMuscleGroup = (value: string): value is MuscleGroup =>
  muscleGroups.some((group) => group === value);

const workoutNamed = (detail: PlanDetail, name: string) => {
  const workout = detail.workouts.find((item) => item.name === name);

  if (!workout) {
    throw new Error(`Workout ${name} not in plan ${detail.id}`);
  }

  return workout;
};

/**
 * The main flow with one real user, in order: each step builds on the state
 * left by the previous one.
 */
describe("plan and workout flow against the local stack", () => {
  let user: TestUser;
  let client: Client;
  let exercises: readonly [ExerciseRow, ExerciseRow];
  let plan: PlanDetail;
  let otherPlan: PlanDetail;
  let session: SessionDetail;

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

    const profile = await callOk<ProfileWithUnits>(client, "get_profile");

    expect(profile).toMatchObject({
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
    });
  });

  it("searches the exercise library and pages past the end", async () => {
    const [first] = exercises;
    const muscleGroup = first.muscle_groups.find(isMuscleGroup);

    const search: { muscleGroup?: MuscleGroup; search: string } = {
      search: first.name,
    };

    if (muscleGroup) {
      search.muscleGroup = muscleGroup;
    }

    const found = await callOk<ExercisePage>(client, "list_exercises", search);

    expect(found.exercises.map((row) => row.slug)).toContain(first.slug);

    const all = await callOk<ExercisePage>(client, "list_exercises", {
      limit: 1,
    });

    expect(all.total).toBeGreaterThanOrEqual(2);
    expect(all.hasMore).toBeTruthy();

    // An offset past the end is an empty page, not an error.
    const pastEnd = await callOk<ExercisePage>(client, "list_exercises", {
      offset: all.total + 10,
    });

    expect(pastEnd).toMatchObject({
      exercises: [],
      hasMore: false,
      total: all.total,
    });
  });

  it("reads the exercise details", async () => {
    const [first] = exercises;

    const detail = await callOk<{ slug: string; steps: string[] }>(
      client,
      "get_exercise",
      { exerciseSlug: first.slug }
    );

    expect(detail.slug).toBe(first.slug);
    expect(detail.steps.length).toBeGreaterThan(0);
  });

  it("creates a plan with ordered workouts, exercises and sets", async () => {
    plan = await callOk<PlanDetail>(
      client,
      "create_plan",
      planInput(exercises)
    );

    expect(plan).toMatchObject({ is_active: true, name: "Integration plan" });
    expect(plan.workouts.map((workout) => workout.name)).toStrictEqual([
      "Day A",
      "Day B",
    ]);
    const dayA = workoutNamed(plan, "Day A");
    expect(
      dayA.exercises.map(({ exercise_slug, muscle_groups, name }) => ({
        muscle_groups,
        name,
        slug: exercise_slug,
      }))
    ).toStrictEqual(
      exercises.map(({ muscle_groups, name, slug }) => ({
        muscle_groups,
        name,
        slug,
      }))
    );
    expect(
      dayA.exercises[0]?.sets.map((set) => set.reps_recommended)
    ).toStrictEqual([8, 6]);
  });

  it("stores a Cover for each Workout, by its most-trained muscle group", async () => {
    const stored = await callOk<PlanDetail>(client, "get_plan", {
      planId: plan.id,
    });

    expect(
      stored.workouts.map(({ cover, name }) => ({ cover, name }))
    ).toStrictEqual([
      { cover: INTEGRATION_COVERS.quadriceps.id, name: "Day A" },
      { cover: INTEGRATION_COVERS.back.id, name: "Day B" },
    ]);
  });

  it("rejects unknown Exercise slugs without creating a plan", async () => {
    const input = planInput(exercises, "Broken plan");
    const unknownSlug = "not-in-the-library";
    const [dayA] = input.workouts;

    const message = await callError(client, "create_plan", {
      ...input,
      workouts: [
        {
          ...dayA,
          exercises: [{ ...dayA.exercises[0], exercise_slug: unknownSlug }],
        },
      ],
    });

    expect(message).toContain(unknownSlug);
  });

  it("gets the plan it created", async () => {
    const fetched = await callOk<PlanDetail>(client, "get_plan", {
      planId: plan.id,
    });

    expect(fetched).toStrictEqual(plan);
  });

  it("makes a newly created plan the only active one", async () => {
    otherPlan = await callOk<PlanDetail>(
      client,
      "create_plan",
      planInput(exercises, "Second plan")
    );

    const plans = await callOk<PlanSummary[]>(client, "list_plans");
    expect(plans.map((item) => [item.id, item.is_active])).toStrictEqual([
      [otherPlan.id, true],
      [plan.id, false],
    ]);
    expect(
      plans[1]?.workouts.map((workout) => workout.exercise_count)
    ).toStrictEqual([2, 1]);
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
    const previousWorkouts = plan.workouts;
    plan = updated;
    expect(updated.workouts).toStrictEqual(previousWorkouts);
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
    ).toStrictEqual([plan.id]);
  });

  it("starts a session from a workout and resumes it", async () => {
    const dayA = workoutNamed(plan, "Day A");

    const started = await callOk<{ resumed: boolean; session: SessionDetail }>(
      client,
      "start_workout_session",
      { workoutId: dayA.id }
    );

    expect(started.resumed).toBeFalsy();
    ({ session } = started);
    expect(session).toMatchObject({
      finished_at: null,
      plan: { id: plan.id, name: plan.name },
      status: "in_progress",
      workout: { id: dayA.id, name: "Day A" },
    });
    expect(
      session.exercises.map((exercise) => [
        exercise.exercise_slug,
        exercise.name,
        exercise.sets.map((set) => [
          set.reps_recommended,
          set.weight_recommended,
          set.logged_at,
        ]),
      ])
    ).toStrictEqual(
      dayA.exercises.map((exercise) => [
        exercise.exercise_slug,
        exercise.name,
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

    expect(resumed).toStrictEqual({ resumed: true, session });
  });

  it("logs a set and overwrites it when logged again", async () => {
    const setId = session.exercises[0]?.sets[0]?.id;
    await callOk(client, "log_set", {
      repsCompleted: 5,
      setId,
      weightCompleted: 50,
    });

    const logged = await callOk<SessionSet>(client, "log_set", {
      repsCompleted: 7,
      setId,
      weightCompleted: 62.5,
    });

    expect(logged).toMatchObject({
      id: setId,
      reps_completed: 7,
      weight_completed: 62.5,
    });

    // A plan set id is not a session set id.
    await callError(client, "log_set", {
      repsCompleted: 1,
      setId: plan.workouts[0]?.exercises[0]?.sets[0]?.id,
      weightCompleted: 1,
    });

    expect(logged.logged_at).toStrictEqual(expect.any(String));
  });

  it("lists the open session as in progress", async () => {
    const open = await callOk<SessionPage>(client, "list_workout_sessions", {
      status: "in_progress",
    });

    expect(open.sessions).toStrictEqual([
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

    expect(rotated.workouts.map((workout) => workout.name)).toStrictEqual([
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

    expect(finished.sessions.map((item) => item.id)).toStrictEqual([
      session.id,
    ]);

    const open = await callOk<SessionPage>(client, "list_workout_sessions", {
      status: "in_progress",
    });

    expect(open).toMatchObject({ sessions: [], total: 0 });

    const pastEnd = await callOk<SessionPage>(client, "list_workout_sessions", {
      offset: 5,
    });

    expect(pastEnd).toMatchObject({ hasMore: false, sessions: [], total: 1 });
  });

  it("notes a logged set of the finished session and refuses a stale write", async () => {
    const loggedId = session.exercises[0]?.sets[0]?.id;

    const setNote = (setId: string | undefined, note: string, expected = "") =>
      call(client, "set_workout_session_set_note", {
        expectedNote: expected,
        note,
        setId,
      });

    const saved = await setNote(loggedId, "  Grip slipped\non rep 7  ");

    expect(saved.json).toMatchObject({
      set: {
        id: loggedId,
        note: "Grip slipped\non rep 7",
        reps_completed: 7,
        weight_completed: 62.5,
      },
    });
    await expect(
      setNote(loggedId, "Grip slipped\non rep 7")
    ).resolves.toMatchObject({ isError: false });

    const stale = await setNote(loggedId, "Chalk next time");

    expect(stale.isError).toBeTruthy();
    expect(stale.text).toContain("Grip slipped\non rep 7");
  });

  it("refuses a note on an unlogged set and reads each set's note", async () => {
    const unlogged = await call(client, "set_workout_session_set_note", {
      expectedNote: "",
      note: "Skipped",
      setId: session.exercises[0]?.sets[1]?.id,
    });

    expect(unlogged.isError).toBeTruthy();
    expect(unlogged.text).toContain("isn't logged");

    const read = await callOk<SessionDetail>(client, "get_workout_session", {
      sessionId: session.id,
    });

    expect(read.exercises[0]?.sets.map((set) => set.note)).toStrictEqual([
      "Grip slipped\non rep 7",
      null,
    ]);
  });

  it("returns the logged set in the exercise history", async () => {
    const [first] = exercises;

    const history = await callOk<ExerciseHistoryPage>(
      client,
      "get_exercise_history",
      { exerciseSlug: first.slug }
    );

    expect(history.entries).toStrictEqual([
      expect.objectContaining({
        plan: { id: plan.id, name: plan.name },
        session_id: session.id,
        sets: [
          expect.objectContaining({
            note: "Grip slipped\non rep 7",
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
      workouts: input.workouts.toReversed(),
    });

    expect(replaced.name).toBe("Renamed plan");
    expect(replaced.workouts.map((workout) => workout.name)).toStrictEqual([
      "Day B",
      "Day A",
    ]);
    const oldIds = new Set(plan.workouts.map((workout) => workout.id));

    for (const workout of replaced.workouts) {
      expect(oldIds.has(workout.id)).toBeFalsy();
    }

    const stored = await callOk<PlanDetail>(client, "get_plan", {
      planId: plan.id,
    });

    expect(
      stored.workouts.map(({ cover, name }) => ({ cover, name }))
    ).toStrictEqual([
      { cover: INTEGRATION_COVERS.back.id, name: "Day B" },
      { cover: INTEGRATION_COVERS.quadriceps.id, name: "Day A" },
    ]);
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

  it("removes a set from an open session, and from no finished one", async () => {
    const { session: open } = await callOk<{ session: SessionDetail }>(
      client,
      "start_workout_session",
      { workoutId: workoutNamed(plan, "Day A").id }
    );

    const [first, second] = open.exercises[0]?.sets ?? [];

    await callOk(client, "log_set", {
      repsCompleted: 8,
      setId: first?.id,
      weightCompleted: 50,
    });

    const removed = await callOk(client, "remove_set_from_workout_session", {
      setId: first?.id,
    });

    expect(removed).toStrictEqual({ removed: true, setId: first?.id });

    // A repeat, and a plan set id.
    const refusals = await Promise.all(
      [first?.id, workoutNamed(plan, "Day A").exercises[0]?.sets[0]?.id].map(
        (setId) =>
          callError(client, "remove_set_from_workout_session", { setId })
      )
    );

    expect(refusals).toStrictEqual([
      expect.stringContaining("not found"),
      expect.stringContaining("not found"),
    ]);

    const current = await callOk<SessionDetail>(client, "get_workout_session", {
      sessionId: open.id,
    });

    // The set left keeps its order, so the gap shows which one went.
    expect(current.exercises).toStrictEqual([
      { ...open.exercises[0], sets: [second] },
      ...open.exercises.slice(1),
    ]);

    const { session: finished } = await callOk<{ session: SessionDetail }>(
      client,
      "finish_workout_session",
      { sessionId: open.id }
    );

    const message = await callError(client, "remove_set_from_workout_session", {
      setId: second?.id,
    });

    expect(message).toContain("finished");
    await expect(
      callOk(client, "get_workout_session", { sessionId: open.id })
    ).resolves.toStrictEqual(finished);

    await callOk(client, "delete_workout_session", { sessionId: open.id });
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

    await callError(client, "get_workout_session", { sessionId: open.id });
    await callError(client, "delete_workout_session", { sessionId: open.id });

    expect(deleted).toStrictEqual({ deleted: true, sessionId: open.id });
  });

  it("soft-deletes a plan and hides it everywhere", async () => {
    const deleted = await callOk(client, "delete_plan", {
      planId: otherPlan.id,
    });

    expect(deleted).toStrictEqual({
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
    expect(plans.map((item) => item.id)).toStrictEqual([plan.id]);
  });

  it("keeps one note per Exercise and refuses a stale write", async () => {
    const [first] = exercises;

    const set = (note: string, expectedNote: string) =>
      call(client, "set_exercise_note", {
        exerciseSlug: first.slug,
        expectedNote,
        note,
      });

    const saved = await set("  Seat on hole 4\nFeet up  ", "");

    expect(saved.json).toMatchObject({
      note: {
        exercise_slug: first.slug,
        name: first.name,
        note: "Seat on hole 4\nFeet up",
      },
    });
    await expect(set("Seat on hole 4\nFeet up", "")).resolves.toMatchObject({
      isError: false,
    });

    const stale = await set("Seat on hole 5", "");

    expect(stale.isError).toBeTruthy();
    expect(stale.text).toContain("Seat on hole 4\nFeet up");
  });

  it("shows the Exercise note with the plan and a session", async () => {
    const [first, second] = exercises;
    const note = "Seat on hole 4\nFeet up";

    const notesOf = (
      list: { exercise_note: string | null; exercise_slug: string }[]
    ) => new Map(list.map((item) => [item.exercise_slug, item.exercise_note]));

    const stored = await callOk<PlanDetail>(client, "get_plan", {
      planId: plan.id,
    });

    const planNotes = notesOf(
      stored.workouts.flatMap((workout) => workout.exercises)
    );

    expect(planNotes.get(first.slug)).toBe(note);
    expect(planNotes.get(second.slug)).toBeNull();

    const past = await callOk<SessionDetail>(client, "get_workout_session", {
      sessionId: session.id,
    });

    expect(notesOf(past.exercises).get(first.slug)).toBe(note);
  });

  it("shows the Exercise note with the Exercise and its history, never in a search", async () => {
    const [first, second] = exercises;
    const note = "Seat on hole 4\nFeet up";

    await expect(
      callOk(client, "get_exercise", { exerciseSlug: first.slug })
    ).resolves.toMatchObject({ exercise_note: note, slug: first.slug });
    await expect(
      callOk(client, "get_exercise", { exerciseSlug: second.slug })
    ).resolves.toMatchObject({ exercise_note: null });
    await expect(
      callOk(client, "get_exercise_history", { exerciseSlug: first.slug })
    ).resolves.toMatchObject({ exercise_note: note });

    const listed = await callOk<{ exercises: object[] }>(
      client,
      "list_exercises",
      { search: first.name }
    );

    expect(JSON.stringify(listed)).not.toContain("exercise_note");
  });

  it("lists the Exercise note, then clears it", async () => {
    const [first] = exercises;

    const listed = await callOk<{ notes: { note: string }[] }>(
      client,
      "list_exercise_notes"
    );

    expect(listed.notes).toStrictEqual([
      expect.objectContaining({
        exercise_slug: first.slug,
        note: "Seat on hole 4\nFeet up",
      }),
    ]);

    await expect(
      callOk(client, "set_exercise_note", {
        exerciseSlug: first.slug,
        expectedNote: "Seat on hole 4\nFeet up",
        note: "",
      })
    ).resolves.toStrictEqual({ note: null });
    await expect(callOk(client, "list_exercise_notes")).resolves.toStrictEqual({
      notes: [],
    });
  });
});
