import { randomUUID } from "node:crypto";

import {
  asUser,
  plans,
  weeklyGoalChanges,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workouts,
} from "@fitme/db";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createPlan, getPlan } from "../src/plans";
import type { NewPlan } from "../src/plans";
import { deleteTestUsers } from "./delete-test-users";

/**
 * createPlan with a request key (ADR 0027): a repeat by the same User answers
 * the first Plan and writes nothing more. Made-up Clerk-style User ids, unique
 * per run, against the local stack's pooler.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const repeater = `user_svcPlanKeyRepeater${runId}`;
const racer = `user_svcPlanKeyRacer${runId}`;
const first = `user_svcPlanKeyFirst${runId}`;
const second = `user_svcPlanKeySecond${runId}`;
const keyless = `user_svcPlanKeyless${runId}`;
const quiet = `user_svcPlanKeyQuiet${runId}`;
const users = [repeater, racer, first, second, keyless, quiet];

const slug = `test-press-${runId}`;

const newPlan = (name: string, frequency = 3): NewPlan => ({
  description: `${name} description`,
  frequency,
  name,
  workouts: [
    {
      description: "Day A",
      exercises: [
        {
          exercise_slug: slug,
          sets: [
            {
              reps_recommended: 8,
              rest_recommended: 90,
              weight_recommended: 40,
            },
          ],
        },
      ],
      name: "A",
    },
  ],
});

const create = (
  userId: string,
  plan: NewPlan,
  requestKey?: string,
  activate?: boolean
) =>
  asUser(
    userId,
    async (tx) => await createPlan(tx, userId, plan, { activate, requestKey })
  );

const plansOf = (userId: string) =>
  withService((tx) =>
    tx
      .select({ id: plans.id, isActive: plans.isActive, name: plans.name })
      .from(plans)
      .where(eq(plans.userId, userId))
      .orderBy(asc(plans.createdAt), asc(plans.id))
  );

const goalLogOf = (userId: string) =>
  withService((tx) =>
    tx
      .select({ target: weeklyGoalChanges.target })
      .from(weeklyGoalChanges)
      .where(eq(weeklyGoalChanges.userId, userId))
      .orderBy(asc(weeklyGoalChanges.recordedAt))
  );

/** Every Workout, Workout Exercise and set row of the Plans given. */
const rowsOf = (planIds: string[]) =>
  withService(async (tx) => ({
    sets: await tx
      .select({ id: workoutExerciseSets.id })
      .from(workoutExerciseSets)
      .innerJoin(
        workoutExercises,
        eq(workoutExercises.id, workoutExerciseSets.workoutExerciseId)
      )
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(inArray(workouts.planId, planIds)),
    workoutExercises: await tx
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(inArray(workouts.planId, planIds)),
    workouts: await tx
      .select({ id: workouts.id })
      .from(workouts)
      .where(inArray(workouts.planId, planIds)),
  }));

describe("createPlan with a request key", () => {
  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("answers the first Plan in full on a repeat and writes nothing more", async () => {
    const key = `proposal-${runId}`;
    const created = await create(repeater, newPlan("Proposed", 3), key);
    const rows = await rowsOf([created.id]);
    const goalLog = await goalLogOf(repeater);

    // A later Plan becomes active, then the step re-runs with another body
    const later = await create(repeater, newPlan("Later", 5));
    const goalLogAfterLater = await goalLogOf(repeater);

    const repeated = await create(repeater, newPlan("Different", 2), key);

    expect(repeated).toMatchObject({
      frequency: 3,
      id: created.id,
      is_active: false,
      name: "Proposed",
      workouts: created.workouts,
    });
    await expect(
      asUser(repeater, async (tx) => await getPlan(tx, repeater, created.id))
    ).resolves.toStrictEqual(repeated);
    await expect(
      Promise.all([
        plansOf(repeater),
        rowsOf([created.id]),
        goalLogOf(repeater),
      ])
    ).resolves.toStrictEqual([
      [
        { id: created.id, isActive: false, name: "Proposed" },
        { id: later.id, isActive: true, name: "Later" },
      ],
      rows,
      goalLogAfterLater,
    ]);
    expect(goalLog).toStrictEqual([{ target: 3 }]);
  });

  it("never activates on a repeat of a create that didn't", async () => {
    const key = `inactive-${runId}`;
    const active = await create(quiet, newPlan("Active"));
    const created = await create(quiet, newPlan("Inactive"), key, false);

    const repeated = await create(quiet, newPlan("Inactive"), key, true);

    expect(repeated).toStrictEqual(created);
    await expect(plansOf(quiet)).resolves.toStrictEqual([
      { id: active.id, isActive: true, name: "Active" },
      { id: created.id, isActive: false, name: "Inactive" },
    ]);
  });

  it("ends two concurrent calls with the same key with one Plan and no error", async () => {
    const key = `race-${runId}`;

    const [one, other] = await Promise.all([
      create(racer, newPlan("Raced"), key),
      create(racer, newPlan("Raced"), key),
    ]);

    expect(other).toStrictEqual(one);
    await expect(plansOf(racer)).resolves.toStrictEqual([
      { id: one.id, isActive: true, name: "Raced" },
    ]);
    await expect(rowsOf([one.id])).resolves.toMatchObject({
      sets: [expect.anything()],
      workoutExercises: [expect.anything()],
      workouts: [expect.anything()],
    });
    await expect(goalLogOf(racer)).resolves.toStrictEqual([{ target: 3 }]);
  });

  it("gives two Users with the same key a Plan each", async () => {
    const key = `shared-${runId}`;

    const firstPlan = await create(first, newPlan("First's"), key);
    const secondPlan = await create(second, newPlan("Second's"), key);

    expect(secondPlan.id).not.toBe(firstPlan.id);
    await expect(plansOf(first)).resolves.toStrictEqual([
      { id: firstPlan.id, isActive: true, name: "First's" },
    ]);
    await expect(plansOf(second)).resolves.toStrictEqual([
      { id: secondPlan.id, isActive: true, name: "Second's" },
    ]);
  });

  it("makes a Plan per call without a key, or with an empty one", async () => {
    const one = await create(keyless, newPlan("Keyless"));
    const two = await create(keyless, newPlan("Keyless"));
    const three = await create(keyless, newPlan("Keyless"), "");
    const four = await create(keyless, newPlan("Keyless"), "");

    await expect(plansOf(keyless)).resolves.toStrictEqual([
      { id: one.id, isActive: false, name: "Keyless" },
      { id: two.id, isActive: false, name: "Keyless" },
      { id: three.id, isActive: false, name: "Keyless" },
      { id: four.id, isActive: true, name: "Keyless" },
    ]);
  });
});
