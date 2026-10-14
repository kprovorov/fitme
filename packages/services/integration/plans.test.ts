import { randomUUID } from "node:crypto";
import {
  asUser,
  exercises,
  plans,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workouts,
} from "@fitme/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deletePlan, getPlan, listPlans } from "../src/plans";

/**
 * The plan services through asUser, against a local Supabase stack via the
 * Supavisor pooler as the fitme login. Made-up Clerk-style User ids, unique
 * per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcPlanOwner${runId}`;
const intruder = `user_svcPlanIntruder${runId}`;

// PostgREST's JSON timestamp encoding, which the MCP tools returned
const JSON_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?\+00:00$/;

let benchId: string;
let squatId: string;

/**
 * A Plan whose Workouts, Exercises and sets are inserted out of order:
 * Day B (order 2) first, then Day A (order 1) with Squat (2) before Bench (1),
 * and Bench's sets 2 before 1.
 */
const seedPlan = (
  userId: string,
  name: string,
  createdAt: string,
  isActive = false
) =>
  withService(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        createdAt,
        description: `${name} description`,
        frequency: 3,
        goal: "muscle-gain",
        isActive,
        name,
        note: "Keep it",
        place: "gym",
        userId,
      })
      .returning({ id: plans.id });
    const [dayB, dayA] = await tx
      .insert(workouts)
      .values([
        { description: "Rest-ish", name: "Day B", order: 2, planId: plan.id },
        { description: "Legs", name: "Day A", order: 1, planId: plan.id },
      ])
      .returning({ id: workouts.id });
    const [squat, bench] = await tx
      .insert(workoutExercises)
      .values([
        { exerciseId: squatId, order: 2, workoutId: dayA.id },
        { exerciseId: benchId, order: 1, workoutId: dayA.id },
      ])
      .returning({ id: workoutExercises.id });
    const [benchSet2, benchSet1, squatSet] = await tx
      .insert(workoutExerciseSets)
      .values([
        {
          order: 2,
          repsRecommended: 6,
          restRecommended: 120,
          weightRecommended: "62.50",
          workoutExerciseId: bench.id,
        },
        {
          order: 1,
          repsRecommended: 8,
          restRecommended: 90,
          weightRecommended: "60.00",
          workoutExerciseId: bench.id,
        },
        {
          order: 1,
          repsRecommended: 5,
          restRecommended: 180,
          weightRecommended: "100.00",
          workoutExerciseId: squat.id,
        },
      ])
      .returning({ id: workoutExerciseSets.id });
    return {
      bench: bench.id,
      benchSet1: benchSet1.id,
      benchSet2: benchSet2.id,
      dayA: dayA.id,
      dayB: dayB.id,
      id: plan.id,
      squat: squat.id,
      squatSet: squatSet.id,
    };
  });

let older: Awaited<ReturnType<typeof seedPlan>>;
let newer: Awaited<ReturnType<typeof seedPlan>>;
let intruderPlan: Awaited<ReturnType<typeof seedPlan>>;

beforeAll(async () => {
  const [bench, squat] = await withService((tx) =>
    tx
      .insert(exercises)
      .values([
        {
          muscleGroups: ["chest"],
          name: "Test bench",
          slug: `test-bench-${runId}`,
        },
        {
          muscleGroups: ["quads", "glutes"],
          name: "Test squat",
          slug: `test-squat-${runId}`,
        },
      ])
      .returning({ id: exercises.id })
  );
  benchId = bench.id;
  squatId = squat.id;
  older = await seedPlan(owner, "Older plan", "2026-01-01T00:00:00Z");
  newer = await seedPlan(owner, "Newer plan", "2026-02-01T00:00:00Z", true);
  intruderPlan = await seedPlan(
    intruder,
    "Intruder plan",
    "2026-03-01T00:00:00Z"
  );
});

afterAll(async () => {
  await withService(async (tx) => {
    await tx.delete(plans).where(inArray(plans.userId, [owner, intruder]));
    await tx.delete(exercises).where(inArray(exercises.id, [benchId, squatId]));
  });
});

describe("getPlan", () => {
  it("returns the Plan with Workouts, Exercises and sets in order", async () => {
    const plan = await asUser(owner, (tx) => getPlan(tx, owner, older.id));

    expect(plan).toEqual({
      created_at: "2026-01-01T00:00:00+00:00",
      description: "Older plan description",
      experience_level: "intermediate",
      frequency: 3,
      goal: "muscle-gain",
      id: older.id,
      is_active: false,
      name: "Older plan",
      note: "Keep it",
      place: "gym",
      updated_at: expect.stringMatching(JSON_TIMESTAMP),
      workout_duration: 60,
      workouts: [
        {
          description: "Legs",
          exercises: [
            {
              exercise: {
                id: benchId,
                muscle_groups: ["chest"],
                name: "Test bench",
              },
              id: older.bench,
              order: 1,
              sets: [
                {
                  id: older.benchSet1,
                  order: 1,
                  reps_recommended: 8,
                  rest_recommended: 90,
                  weight_recommended: 60,
                },
                {
                  id: older.benchSet2,
                  order: 2,
                  reps_recommended: 6,
                  rest_recommended: 120,
                  weight_recommended: 62.5,
                },
              ],
            },
            {
              exercise: {
                id: squatId,
                muscle_groups: ["quads", "glutes"],
                name: "Test squat",
              },
              id: older.squat,
              order: 2,
              sets: [
                {
                  id: older.squatSet,
                  order: 1,
                  reps_recommended: 5,
                  rest_recommended: 180,
                  weight_recommended: 100,
                },
              ],
            },
          ],
          id: older.dayA,
          name: "Day A",
          order: 1,
        },
        {
          description: "Rest-ish",
          exercises: [],
          id: older.dayB,
          name: "Day B",
          order: 2,
        },
      ],
    });
  });

  it("never returns another User's Plan", async () => {
    expect(
      await asUser(owner, (tx) => getPlan(tx, owner, intruderPlan.id))
    ).toBeNull();
    // asking with the owner's id doesn't get past RLS either
    expect(
      await asUser(intruder, (tx) => getPlan(tx, owner, older.id))
    ).toBeNull();
  });

  it("returns null for an unknown Plan", async () => {
    expect(
      await asUser(owner, (tx) => getPlan(tx, owner, randomUUID()))
    ).toBeNull();
  });
});

describe("listPlans", () => {
  it("lists the User's Plans newest first with Workout summaries", async () => {
    const listed = await asUser(owner, (tx) => listPlans(tx, owner));

    expect(listed.map((plan) => plan.id)).toEqual([newer.id, older.id]);
    expect(listed[1]).toMatchObject({
      created_at: "2026-01-01T00:00:00+00:00",
      id: older.id,
      name: "Older plan",
      workouts: [
        { exercise_count: 2, id: older.dayA, name: "Day A", order: 1 },
        { exercise_count: 0, id: older.dayB, name: "Day B", order: 2 },
      ],
    });
    expect(listed[1]).not.toHaveProperty("deleted_at");
  });

  it("never lists another User's Plans", async () => {
    const listed = await asUser(intruder, (tx) => listPlans(tx, intruder));
    expect(listed.map((plan) => plan.id)).toEqual([intruderPlan.id]);
    expect(await asUser(intruder, (tx) => listPlans(tx, owner))).toEqual([]);
  });
});

describe("deletePlan", () => {
  it("never deletes another User's Plan", async () => {
    expect(
      await asUser(intruder, (tx) => deletePlan(tx, intruder, older.id))
    ).toBeNull();
    expect(
      await asUser(intruder, (tx) => deletePlan(tx, owner, older.id))
    ).toBeNull();
    const [row] = await withService((tx) =>
      tx
        .select({ deletedAt: plans.deletedAt })
        .from(plans)
        .where(eq(plans.id, older.id))
    );
    expect(row?.deletedAt).toBeNull();
  });

  it("soft-deletes the active Plan, leaving no active Plan", async () => {
    const result = await asUser(owner, (tx) => deletePlan(tx, owner, newer.id));

    expect(result).toEqual({
      alreadyDeleted: false,
      deleted: true,
      plan: { id: newer.id, name: "Newer plan" },
    });
    const [row] = await withService((tx) =>
      tx
        .select({ deletedAt: plans.deletedAt, isActive: plans.isActive })
        .from(plans)
        .where(eq(plans.id, newer.id))
    );
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.isActive).toBe(false);
    // its Workouts stay, for the Workout Sessions linked to them
    const remaining = await withService((tx) =>
      tx
        .select({ id: workouts.id })
        .from(workouts)
        .where(eq(workouts.planId, newer.id))
    );
    expect(remaining).toHaveLength(2);
  });

  it("hides the deleted Plan from listPlans and getPlan", async () => {
    const listed = await asUser(owner, (tx) => listPlans(tx, owner));
    expect(listed.map((plan) => [plan.id, plan.is_active])).toEqual([
      [older.id, false],
    ]);
    expect(
      await asUser(owner, (tx) => getPlan(tx, owner, newer.id))
    ).toBeNull();
  });

  it("is a no-op for an already deleted Plan", async () => {
    expect(
      await asUser(owner, (tx) => deletePlan(tx, owner, newer.id))
    ).toEqual({
      alreadyDeleted: true,
      deleted: true,
      plan: { id: newer.id, name: "Newer plan" },
    });
  });

  it("returns null for an unknown Plan", async () => {
    expect(
      await asUser(owner, (tx) => deletePlan(tx, owner, randomUUID()))
    ).toBeNull();
  });
});
