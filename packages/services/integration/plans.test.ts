import { randomUUID } from "node:crypto";
import {
  asUser,
  exercises,
  plans,
  retiredUserIdsInPrivate,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workouts,
} from "@fitme/db";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  activatePlan,
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  type NewPlan,
  UnknownExercisesError,
  updatePlan,
} from "../src/plans";

/**
 * The plan services through asUser, against a local Supabase stack via the
 * Supavisor pooler as the fitme login. Made-up Clerk-style User ids, unique
 * per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcPlanOwner${runId}`;
const intruder = `user_svcPlanIntruder${runId}`;
const activator = `user_svcPlanActivator${runId}`;
const bystander = `user_svcPlanBystander${runId}`;
const creator = `user_svcPlanCreator${runId}`;
const retired = `user_svcPlanRetired${runId}`;
const updater = `user_svcPlanUpdater${runId}`;

// Past int4: the sets insert fails after the Plan and Workouts went in
const OUT_OF_RANGE_REPS = 2 ** 31;
const NUMERIC_OUT_OF_RANGE = "22003";
// RLS, or the reject_retired_user_id trigger
const INSUFFICIENT_PRIVILEGE = "42501";

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
    await tx
      .delete(plans)
      .where(
        inArray(plans.userId, [
          owner,
          intruder,
          activator,
          bystander,
          creator,
          retired,
          updater,
        ])
      );
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

describe("activatePlan", () => {
  let first: Awaited<ReturnType<typeof seedPlan>>;
  let second: Awaited<ReturnType<typeof seedPlan>>;
  let third: Awaited<ReturnType<typeof seedPlan>>;
  let deleted: Awaited<ReturnType<typeof seedPlan>>;
  let bystanderPlan: Awaited<ReturnType<typeof seedPlan>>;

  /** Every Plan of `userId` that is active, by id. */
  const activePlans = (userId: string) =>
    withService(async (tx) =>
      (
        await tx
          .select({ id: plans.id })
          .from(plans)
          .where(and(eq(plans.userId, userId), eq(plans.isActive, true)))
      ).map((row) => row.id)
    );

  beforeAll(async () => {
    first = await seedPlan(activator, "First", "2026-01-01T00:00:00Z", true);
    second = await seedPlan(activator, "Second", "2026-02-01T00:00:00Z");
    third = await seedPlan(activator, "Third", "2026-03-01T00:00:00Z");
    deleted = await seedPlan(activator, "Deleted", "2026-04-01T00:00:00Z");
    await withService((tx) =>
      tx
        .update(plans)
        .set({ deletedAt: "2026-04-02T00:00:00Z" })
        .where(eq(plans.id, deleted.id))
    );
    bystanderPlan = await seedPlan(
      bystander,
      "Bystander",
      "2026-01-01T00:00:00Z",
      true
    );
  });

  it("activates the Plan, deactivates the others and returns its summary", async () => {
    const activated = await asUser(activator, (tx) =>
      activatePlan(tx, activator, second.id)
    );

    expect(activated).toEqual({
      created_at: "2026-02-01T00:00:00+00:00",
      description: "Second description",
      experience_level: "intermediate",
      frequency: 3,
      goal: "muscle-gain",
      id: second.id,
      is_active: true,
      name: "Second",
      note: "Keep it",
      place: "gym",
      updated_at: expect.stringMatching(JSON_TIMESTAMP),
      workout_duration: 60,
      workouts: [
        { exercise_count: 2, id: second.dayA, name: "Day A", order: 1 },
        { exercise_count: 0, id: second.dayB, name: "Day B", order: 2 },
      ],
    });
    expect(await activePlans(activator)).toEqual([second.id]);
  });

  it("leaves other Users' active Plans untouched", async () => {
    expect(await activePlans(bystander)).toEqual([bystanderPlan.id]);
  });

  it("keeps the active Plan active when activated again", async () => {
    const activated = await asUser(activator, (tx) =>
      activatePlan(tx, activator, second.id)
    );
    expect(activated?.is_active).toBe(true);
    expect(await activePlans(activator)).toEqual([second.id]);
  });

  it("refuses a soft-deleted Plan without changing anything", async () => {
    expect(
      await asUser(activator, (tx) => activatePlan(tx, activator, deleted.id))
    ).toBeNull();
    expect(await activePlans(activator)).toEqual([second.id]);
  });

  it("refuses another User's Plan without changing anything", async () => {
    expect(
      await asUser(activator, (tx) =>
        activatePlan(tx, activator, bystanderPlan.id)
      )
    ).toBeNull();
    // asking with the owner's id doesn't get past RLS either
    expect(
      await asUser(activator, (tx) =>
        activatePlan(tx, bystander, bystanderPlan.id)
      )
    ).toBeNull();
    expect(
      await asUser(bystander, (tx) => activatePlan(tx, activator, first.id))
    ).toBeNull();
    expect(await activePlans(activator)).toEqual([second.id]);
    expect(await activePlans(bystander)).toEqual([bystanderPlan.id]);
  });

  it("returns null for an unknown Plan", async () => {
    expect(
      await asUser(activator, (tx) => activatePlan(tx, activator, randomUUID()))
    ).toBeNull();
    expect(await activePlans(activator)).toEqual([second.id]);
  });

  it("never leaves two active Plans after concurrent activations", async () => {
    const targets = [first.id, second.id, third.id];
    const results = await Promise.all(
      [...targets, ...targets, ...targets, ...targets].map((planId) =>
        asUser(activator, (tx) => activatePlan(tx, activator, planId))
      )
    );

    expect(results.every((plan) => plan?.is_active)).toBe(true);
    const active = await activePlans(activator);
    expect(active).toHaveLength(1);
    expect(targets).toContain(active[0]);
    expect(await activePlans(bystander)).toEqual([bystanderPlan.id]);
  });
});

/** Every Plan of `userId`, oldest first, with its active flag. */
const plansOf = (userId: string) =>
  withService((tx) =>
    tx
      .select({ id: plans.id, isActive: plans.isActive, name: plans.name })
      .from(plans)
      .where(eq(plans.userId, userId))
      .orderBy(plans.createdAt, plans.id)
  );

/** Two Workouts: Push (Bench with two sets, then Squat) and Legs (Squat). */
const newPlan = (name: string): NewPlan => ({
  description: `${name} description`,
  experience_level: "beginner",
  frequency: 2,
  goal: "strength",
  name,
  note: "Created by a service",
  place: "gym",
  workout_duration: 45,
  workouts: [
    {
      description: "Chest first",
      exercises: [
        {
          exercise_id: benchId,
          sets: [
            {
              reps_recommended: 8,
              rest_recommended: 90,
              weight_recommended: 60,
            },
            {
              reps_recommended: 6,
              rest_recommended: 120,
              weight_recommended: 62.5,
            },
          ],
        },
        {
          exercise_id: squatId,
          sets: [
            {
              reps_recommended: 5,
              rest_recommended: 180,
              weight_recommended: 100,
            },
          ],
        },
      ],
      name: "Push",
    },
    {
      description: "Legs only",
      exercises: [
        {
          exercise_id: squatId,
          sets: [
            {
              reps_recommended: 10,
              rest_recommended: 60,
              weight_recommended: 80,
            },
          ],
        },
      ],
      name: "Legs",
    },
  ],
});

describe("createPlan", () => {
  it("creates the Plan with its Workouts, Exercises and sets in array order and activates it", async () => {
    const existing = await seedPlan(
      creator,
      "Existing",
      "2026-01-01T00:00:00Z",
      true
    );

    const created = await asUser(creator, (tx) =>
      createPlan(tx, creator, newPlan("Created"))
    );

    expect(created).toEqual({
      created_at: expect.stringMatching(JSON_TIMESTAMP),
      description: "Created description",
      experience_level: "beginner",
      frequency: 2,
      goal: "strength",
      id: expect.any(String),
      is_active: true,
      name: "Created",
      note: "Created by a service",
      place: "gym",
      updated_at: expect.stringMatching(JSON_TIMESTAMP),
      workout_duration: 45,
      workouts: [
        {
          description: "Chest first",
          exercises: [
            {
              exercise: {
                id: benchId,
                muscle_groups: ["chest"],
                name: "Test bench",
              },
              id: expect.any(String),
              order: 1,
              sets: [
                {
                  id: expect.any(String),
                  order: 1,
                  reps_recommended: 8,
                  rest_recommended: 90,
                  weight_recommended: 60,
                },
                {
                  id: expect.any(String),
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
              id: expect.any(String),
              order: 2,
              sets: [
                {
                  id: expect.any(String),
                  order: 1,
                  reps_recommended: 5,
                  rest_recommended: 180,
                  weight_recommended: 100,
                },
              ],
            },
          ],
          id: expect.any(String),
          name: "Push",
          order: 1,
        },
        {
          description: "Legs only",
          exercises: [
            {
              exercise: {
                id: squatId,
                muscle_groups: ["quads", "glutes"],
                name: "Test squat",
              },
              id: expect.any(String),
              order: 1,
              sets: [
                {
                  id: expect.any(String),
                  order: 1,
                  reps_recommended: 10,
                  rest_recommended: 60,
                  weight_recommended: 80,
                },
              ],
            },
          ],
          id: expect.any(String),
          name: "Legs",
          order: 2,
        },
      ],
    });
    expect(
      await asUser(creator, (tx) => getPlan(tx, creator, created.id))
    ).toEqual(created);
    expect(await plansOf(creator)).toEqual([
      { id: existing.id, isActive: false, name: "Existing" },
      { id: created.id, isActive: true, name: "Created" },
    ]);
  });

  it("refuses unknown Exercises without creating anything", async () => {
    const before = await plansOf(creator);
    const unknownId = randomUUID();
    const plan = newPlan("Unknown exercises");
    plan.workouts[1].exercises.push({
      exercise_id: unknownId,
      sets: [
        { reps_recommended: 5, rest_recommended: 60, weight_recommended: 0 },
      ],
    });

    const error = await asUser(creator, (tx) =>
      createPlan(tx, creator, plan)
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnknownExercisesError);
    expect((error as UnknownExercisesError).exerciseIds).toEqual([unknownId]);
    expect(await plansOf(creator)).toEqual(before);
  });

  it("leaves nothing behind when a write fails partway", async () => {
    const before = await plansOf(creator);
    const plan = newPlan("Half written");
    plan.workouts[1].exercises[0].sets[0].reps_recommended = OUT_OF_RANGE_REPS;

    await expect(
      asUser(creator, (tx) => createPlan(tx, creator, plan))
    ).rejects.toMatchObject({ cause: { code: NUMERIC_OUT_OF_RANGE } });

    expect(await plansOf(creator)).toEqual(before);
    const orphans = await withService((tx) =>
      tx
        .select({ id: workouts.id })
        .from(workouts)
        .innerJoin(plans, eq(plans.id, workouts.planId))
        .where(and(eq(plans.userId, creator), eq(plans.name, "Half written")))
    );
    expect(orphans).toEqual([]);
  });

  it("never creates a Plan for another User", async () => {
    await expect(
      asUser(intruder, (tx) => createPlan(tx, creator, newPlan("Planted")))
    ).rejects.toMatchObject({ cause: { code: INSUFFICIENT_PRIVILEGE } });
    expect((await plansOf(creator)).map((plan) => plan.name)).not.toContain(
      "Planted"
    );
  });

  it("refuses a retired User id", async () => {
    await withService((tx) =>
      tx.insert(retiredUserIdsInPrivate).values({ userId: retired })
    );

    await expect(
      asUser(retired, (tx) => createPlan(tx, retired, newPlan("Ghost")))
    ).rejects.toMatchObject({ cause: { code: INSUFFICIENT_PRIVILEGE } });
    expect(await plansOf(retired)).toEqual([]);
  });
});

describe("updatePlan", () => {
  let plan: Awaited<ReturnType<typeof seedPlan>>;
  let deleted: Awaited<ReturnType<typeof seedPlan>>;
  let bystanderPlan: Awaited<ReturnType<typeof seedPlan>>;

  /** The Plan as the User sees it, read in its own transaction. */
  const read = (userId: string, planId: string) =>
    asUser(userId, (tx) => getPlan(tx, userId, planId));

  beforeAll(async () => {
    plan = await seedPlan(updater, "To update", "2026-01-01T00:00:00Z");
    deleted = await seedPlan(updater, "Deleted", "2026-02-01T00:00:00Z");
    await withService((tx) =>
      tx
        .update(plans)
        .set({ deletedAt: "2026-02-02T00:00:00Z" })
        .where(eq(plans.id, deleted.id))
    );
    bystanderPlan = await seedPlan(
      bystander,
      "Bystander update",
      "2026-01-01T00:00:00Z"
    );
  });

  it("updates only the given metadata and keeps the Workouts and their ids", async () => {
    const before = await read(updater, plan.id);

    const updated = await asUser(updater, (tx) =>
      updatePlan(tx, updater, plan.id, {
        frequency: 4,
        name: "Renamed",
        note: null,
      })
    );

    expect(updated).toEqual({
      ...before,
      frequency: 4,
      name: "Renamed",
      note: null,
      updated_at: expect.stringMatching(JSON_TIMESTAMP),
    });
    expect(updated?.updated_at).not.toBe(before?.updated_at);
    expect(await read(updater, plan.id)).toEqual(updated);
  });

  it("recreates every Workout from the list, in order, with new ids", async () => {
    const before = await read(updater, plan.id);
    const oldIds = new Set(before?.workouts.map((workout) => workout.id));
    const { workouts: replacement } = newPlan("Replacement");

    const updated = await asUser(updater, (tx) =>
      updatePlan(tx, updater, plan.id, {
        goal: "muscle-gain",
        workouts: [...replacement].reverse(),
      })
    );

    expect(updated).toMatchObject({
      description: before?.description,
      frequency: 4,
      goal: "muscle-gain",
      is_active: false,
      name: "Renamed",
    });
    expect(
      updated?.workouts.map((workout) => [
        workout.order,
        workout.name,
        workout.exercises.map((exercise) => [
          exercise.order,
          exercise.exercise.id,
          exercise.sets.map((set) => [set.order, set.reps_recommended]),
        ]),
      ])
    ).toEqual([
      [1, "Legs", [[1, squatId, [[1, 10]]]]],
      [
        2,
        "Push",
        [
          [
            1,
            benchId,
            [
              [1, 8],
              [2, 6],
            ],
          ],
          [2, squatId, [[1, 5]]],
        ],
      ],
    ]);
    for (const workout of updated?.workouts ?? []) {
      expect(oldIds.has(workout.id)).toBe(false);
    }
    const leftovers = await withService((tx) =>
      tx
        .select({ id: workouts.id })
        .from(workouts)
        .where(inArray(workouts.id, [...oldIds]))
    );
    expect(leftovers).toEqual([]);
    expect(await read(updater, plan.id)).toEqual(updated);
  });

  it("never updates another User's Plan", async () => {
    const before = await read(bystander, bystanderPlan.id);

    expect(
      await asUser(updater, (tx) =>
        updatePlan(tx, updater, bystanderPlan.id, { name: "Hijacked" })
      )
    ).toBeNull();
    // asking with the owner's id doesn't get past RLS either
    expect(
      await asUser(updater, (tx) =>
        updatePlan(tx, bystander, bystanderPlan.id, {
          name: "Hijacked",
          workouts: newPlan("Hijacked").workouts,
        })
      )
    ).toBeNull();
    expect(await read(bystander, bystanderPlan.id)).toEqual(before);
  });

  it("refuses a soft-deleted Plan without changing it", async () => {
    expect(
      await asUser(updater, (tx) =>
        updatePlan(tx, updater, deleted.id, { name: "Revived" })
      )
    ).toBeNull();
    const [row] = await withService((tx) =>
      tx
        .select({ deletedAt: plans.deletedAt, name: plans.name })
        .from(plans)
        .where(eq(plans.id, deleted.id))
    );
    expect(row).toEqual({ deletedAt: expect.any(String), name: "Deleted" });
  });

  it("returns null for an unknown Plan", async () => {
    expect(
      await asUser(updater, (tx) =>
        updatePlan(tx, updater, randomUUID(), { name: "Nobody" })
      )
    ).toBeNull();
  });

  it("refuses unknown Exercises without changing anything", async () => {
    const before = await read(updater, plan.id);
    const unknownId = randomUUID();
    const { workouts: replacement } = newPlan("Unknown");
    replacement[0].exercises[0].exercise_id = unknownId;

    const error = await asUser(updater, (tx) =>
      updatePlan(tx, updater, plan.id, {
        name: "Not saved",
        workouts: replacement,
      })
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnknownExercisesError);
    expect((error as UnknownExercisesError).exerciseIds).toEqual([unknownId]);
    expect(await read(updater, plan.id)).toEqual(before);
  });

  it("changes nothing when a write fails partway", async () => {
    const before = await read(updater, plan.id);
    const { workouts: replacement } = newPlan("Half written");
    replacement[1].exercises[0].sets[0].reps_recommended = OUT_OF_RANGE_REPS;

    await expect(
      asUser(updater, (tx) =>
        updatePlan(tx, updater, plan.id, {
          name: "Not saved",
          workouts: replacement,
        })
      )
    ).rejects.toMatchObject({ cause: { code: NUMERIC_OUT_OF_RANGE } });

    expect(await read(updater, plan.id)).toEqual(before);
  });
});
