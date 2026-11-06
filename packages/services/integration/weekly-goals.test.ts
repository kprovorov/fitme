import { randomUUID } from "node:crypto";

import { asUser, plans, weeklyGoalChanges, withService } from "@fitme/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { deleteUserData } from "../src/delete-user-data";
import { activatePlan, createPlan, deletePlan, updatePlan } from "../src/plans";
import type { NewPlan } from "../src/plans";
import { listWeeklyGoalChanges, recordWeeklyGoal } from "../src/weekly-goals";
import {
  finishWorkoutSession,
  startWorkoutSession,
} from "../src/workout-sessions";
import { deleteTestUsers, withUserTablesLocked } from "./delete-test-users";

/**
 * The Weekly goal log (ADR 0015) through asUser, against a local Supabase
 * stack via the Supavisor pooler as the fitme login: every writer that can
 * change the active Plan or its frequency appends the new goal, nothing
 * rewrites an earlier one. Made-up Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const user = (name: string) => `user_svcGoal${name}${runId}`;
const users: string[] = [];

const newUser = (name: string) => {
  const id = user(name);
  users.push(id);

  return id;
};

const plan = (frequency: number): NewPlan => ({
  description: "Weekly goal fixture",
  experience_level: "beginner",
  frequency,
  goal: "strength",
  name: `${frequency} a week`,
  place: "gym",
  workout_duration: 45,
  workouts: [
    {
      description: "Day A",
      exercises: [
        {
          exercise_slug: `test-squat-${runId}`,
          sets: [
            {
              reps_recommended: 5,
              rest_recommended: 90,
              weight_recommended: 60,
            },
          ],
        },
      ],
      name: "Day A",
    },
  ],
});

const targets = async (userId: string) => {
  const changes = await asUser(
    userId,
    async (tx) => await listWeeklyGoalChanges(tx, userId)
  );

  return changes.map((change) => change.target);
};

const create = async (userId: string, frequency: number, activate = true) =>
  await asUser(
    userId,
    async (tx) => await createPlan(tx, userId, plan(frequency), { activate })
  );

// PostgREST's JSON timestamp encoding
const JSON_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?\+00:00$/u;

describe("the Weekly goal log", () => {
  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it.each([8, 32_767])(
    "rejects direct oversized goal writes (%s)",
    async (target) => {
      const userId = newUser(`OutOfRange${target}`);
      await expect(
        asUser(userId, (tx) =>
          tx.insert(weeklyGoalChanges).values({ target, userId })
        )
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      await expect(targets(userId)).resolves.toStrictEqual([]);
    }
  );

  it("starts with the first active Plan's frequency and ignores repeats", async () => {
    const userId = newUser("First");
    await expect(targets(userId)).resolves.toStrictEqual([]);

    const created = await create(userId, 3);
    await asUser(
      userId,
      async (tx) => await activatePlan(tx, userId, created.id)
    );
    await asUser(userId, async (tx) => {
      await recordWeeklyGoal(tx, userId);
    });

    const changes = await asUser(
      userId,
      async (tx) => await listWeeklyGoalChanges(tx, userId)
    );

    const recordedAt: unknown = expect.stringMatching(JSON_TIMESTAMP);
    expect(changes).toStrictEqual([{ recorded_at: recordedAt, target: 3 }]);
  });

  it("records nothing before any Plan is active", async () => {
    const userId = newUser("NoPlan");
    await asUser(userId, async (tx) => {
      await recordWeeklyGoal(tx, userId);
    });
    await create(userId, 4, false);

    await expect(targets(userId)).resolves.toStrictEqual([]);
  });

  it("appends a frequency change of the active Plan, keeping the goals before it", async () => {
    const userId = newUser("Frequency");
    const created = await create(userId, 3);

    const first = await asUser(
      userId,
      async (tx) => await listWeeklyGoalChanges(tx, userId)
    );

    await asUser(
      userId,
      async (tx) => await updatePlan(tx, userId, created.id, { frequency: 5 })
    );
    // Only metadata other than the frequency: nothing to record
    await asUser(
      userId,
      async (tx) =>
        await updatePlan(tx, userId, created.id, { name: "Renamed" })
    );

    const changes = await asUser(
      userId,
      async (tx) => await listWeeklyGoalChanges(tx, userId)
    );

    expect(changes.map((change) => change.target)).toStrictEqual([3, 5]);
    // The first goal is retained as it was recorded
    expect(changes[0]).toStrictEqual(first[0]);
    expect(Date.parse(changes[1].recorded_at)).toBeGreaterThanOrEqual(
      Date.parse(changes[0].recorded_at)
    );
  });

  it("ignores a frequency change of an inactive Plan", async () => {
    const userId = newUser("Inactive");
    await create(userId, 3);
    const spare = await create(userId, 2, false);

    await asUser(
      userId,
      async (tx) => await updatePlan(tx, userId, spare.id, { frequency: 6 })
    );

    await expect(targets(userId)).resolves.toStrictEqual([3]);
  });

  it("follows Plan switches, appending only when the goal changes", async () => {
    const userId = newUser("Switch");
    const first = await create(userId, 3);
    const sameGoal = await create(userId, 3, false);
    const otherGoal = await create(userId, 4, false);

    await asUser(
      userId,
      async (tx) => await activatePlan(tx, userId, sameGoal.id)
    );
    await expect(targets(userId)).resolves.toStrictEqual([3]);

    await asUser(
      userId,
      async (tx) => await activatePlan(tx, userId, otherGoal.id)
    );
    await asUser(
      userId,
      async (tx) => await activatePlan(tx, userId, first.id)
    );
    // Created and activated in one go
    await create(userId, 2);

    await expect(targets(userId)).resolves.toStrictEqual([3, 4, 3, 2]);
  });

  it("records no goal when the active Plan is deleted, then the next one", async () => {
    const userId = newUser("Delete");
    const active = await create(userId, 3);
    const spare = await create(userId, 5, false);

    await asUser(userId, async (tx) => await deletePlan(tx, userId, spare.id));
    await expect(targets(userId)).resolves.toStrictEqual([3]);

    await asUser(userId, async (tx) => await deletePlan(tx, userId, active.id));
    // A repeat deletes nothing more and records nothing more
    await asUser(userId, async (tx) => await deletePlan(tx, userId, active.id));
    await expect(targets(userId)).resolves.toStrictEqual([3, null]);

    await create(userId, 2);
    await expect(targets(userId)).resolves.toStrictEqual([3, null, 2]);
  });

  it("starts tracking on a finish when the active Plan was written past the services", async () => {
    const userId = newUser("Finish");

    // An older client's direct write: no service recorded the goal
    const workoutId = await withService(async (tx) => {
      await tx.insert(plans).values({
        frequency: 4,
        goal: "strength",
        isActive: true,
        place: "gym",
        userId,
      });

      const [row] = await tx
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.userId, userId));

      return row.id;
    });

    const created = await asUser(
      userId,
      async (tx) =>
        await updatePlan(tx, userId, workoutId, {
          workouts: plan(4).workouts,
        })
    );

    await expect(targets(userId)).resolves.toStrictEqual([]);

    const started = await asUser(
      userId,
      async (tx) =>
        await startWorkoutSession(tx, created?.workouts[0]?.id ?? "")
    );

    if (started.status !== "started") {
      throw new Error(`Expected a started session, got ${started.status}`);
    }

    await asUser(
      userId,
      async (tx) => await finishWorkoutSession(tx, started.session.id)
    );
    // A repeated finish changes nothing, and records nothing more
    await asUser(
      userId,
      async (tx) => await finishWorkoutSession(tx, started.session.id)
    );

    await expect(targets(userId)).resolves.toStrictEqual([4]);
  });

  it("keeps each User's goals to themselves", async () => {
    const owner = newUser("Owner");
    const intruder = newUser("Intruder");
    await create(owner, 3);

    await expect(
      asUser(intruder, async (tx) => await listWeeklyGoalChanges(tx, owner))
    ).resolves.toStrictEqual([]);
    await expect(
      asUser(intruder, (tx) =>
        tx.insert(weeklyGoalChanges).values({ target: 7, userId: owner })
      )
    ).rejects.toThrow('Failed query: insert into "weekly_goal_changes"');
    await expect(
      asUser(intruder, (tx) =>
        tx
          .update(weeklyGoalChanges)
          .set({ target: 1 })
          .where(eq(weeklyGoalChanges.userId, intruder))
      )
    ).rejects.toThrow('Failed query: update "weekly_goal_changes"');
    await expect(targets(owner)).resolves.toStrictEqual([3]);
  });

  it("is deleted with the User's data", async () => {
    const userId = newUser("Deleted");
    await create(userId, 3);

    await withUserTablesLocked(async (tx) => {
      await deleteUserData(tx, userId);
    });

    const left = await withService((tx) =>
      tx
        .select({ id: weeklyGoalChanges.id })
        .from(weeklyGoalChanges)
        .where(eq(weeklyGoalChanges.userId, userId))
    );

    expect(left).toStrictEqual([]);
  });
});
