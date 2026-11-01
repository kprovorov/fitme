import { randomUUID } from "node:crypto";
import { asUser, plans, weeklyGoalChanges, withService } from "@fitme/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { deleteUserData } from "../src/delete-user-data";
import {
  activatePlan,
  createPlan,
  deletePlan,
  type NewPlan,
  updatePlan,
} from "../src/plans";
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

afterAll(async () => {
  await deleteTestUsers(users);
});

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

const targets = async (userId: string) =>
  (await asUser(userId, (tx) => listWeeklyGoalChanges(tx, userId))).map(
    (change) => change.target
  );

const create = (userId: string, frequency: number, activate = true) =>
  asUser(userId, (tx) => createPlan(tx, userId, plan(frequency), { activate }));

// PostgREST's JSON timestamp encoding
const JSON_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?\+00:00$/;

describe("the Weekly goal log", () => {
  it.each([8, 32_767])(
    "rejects direct oversized goal writes (%s)",
    async (target) => {
      const userId = newUser(`OutOfRange${target}`);
      await expect(
        asUser(userId, (tx) =>
          tx.insert(weeklyGoalChanges).values({ target, userId })
        )
      ).rejects.toMatchObject({ cause: { code: "23514" } });
      expect(await targets(userId)).toEqual([]);
    }
  );
  it("starts with the first active Plan's frequency and ignores repeats", async () => {
    const userId = newUser("First");
    expect(await targets(userId)).toEqual([]);

    const created = await create(userId, 3);
    await asUser(userId, (tx) => activatePlan(tx, userId, created.id));
    await asUser(userId, (tx) => recordWeeklyGoal(tx, userId));

    const changes = await asUser(userId, (tx) =>
      listWeeklyGoalChanges(tx, userId)
    );
    expect(changes).toEqual([
      { recorded_at: expect.stringMatching(JSON_TIMESTAMP), target: 3 },
    ]);
  });

  it("records nothing before any Plan is active", async () => {
    const userId = newUser("NoPlan");
    await asUser(userId, (tx) => recordWeeklyGoal(tx, userId));
    await create(userId, 4, false);

    expect(await targets(userId)).toEqual([]);
  });

  it("appends a frequency change of the active Plan, keeping the goals before it", async () => {
    const userId = newUser("Frequency");
    const created = await create(userId, 3);
    const first = await asUser(userId, (tx) =>
      listWeeklyGoalChanges(tx, userId)
    );

    await asUser(userId, (tx) =>
      updatePlan(tx, userId, created.id, { frequency: 5 })
    );
    // Only metadata other than the frequency: nothing to record
    await asUser(userId, (tx) =>
      updatePlan(tx, userId, created.id, { name: "Renamed" })
    );

    const changes = await asUser(userId, (tx) =>
      listWeeklyGoalChanges(tx, userId)
    );
    expect(changes.map((change) => change.target)).toEqual([3, 5]);
    // The first goal is retained as it was recorded
    expect(changes[0]).toEqual(first[0]);
    expect(Date.parse(changes[1].recorded_at)).toBeGreaterThanOrEqual(
      Date.parse(changes[0].recorded_at)
    );
  });

  it("ignores a frequency change of an inactive Plan", async () => {
    const userId = newUser("Inactive");
    await create(userId, 3);
    const spare = await create(userId, 2, false);

    await asUser(userId, (tx) =>
      updatePlan(tx, userId, spare.id, { frequency: 6 })
    );

    expect(await targets(userId)).toEqual([3]);
  });

  it("follows Plan switches, appending only when the goal changes", async () => {
    const userId = newUser("Switch");
    const first = await create(userId, 3);
    const sameGoal = await create(userId, 3, false);
    const otherGoal = await create(userId, 4, false);

    await asUser(userId, (tx) => activatePlan(tx, userId, sameGoal.id));
    expect(await targets(userId)).toEqual([3]);

    await asUser(userId, (tx) => activatePlan(tx, userId, otherGoal.id));
    await asUser(userId, (tx) => activatePlan(tx, userId, first.id));
    // Created and activated in one go
    await create(userId, 2);

    expect(await targets(userId)).toEqual([3, 4, 3, 2]);
  });

  it("records no goal when the active Plan is deleted, then the next one", async () => {
    const userId = newUser("Delete");
    const active = await create(userId, 3);
    const spare = await create(userId, 5, false);

    await asUser(userId, (tx) => deletePlan(tx, userId, spare.id));
    expect(await targets(userId)).toEqual([3]);

    await asUser(userId, (tx) => deletePlan(tx, userId, active.id));
    // A repeat deletes nothing more and records nothing more
    await asUser(userId, (tx) => deletePlan(tx, userId, active.id));
    expect(await targets(userId)).toEqual([3, null]);

    await create(userId, 2);
    expect(await targets(userId)).toEqual([3, null, 2]);
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
    const created = await asUser(userId, (tx) =>
      updatePlan(tx, userId, workoutId, {
        workouts: plan(4).workouts,
      })
    );
    expect(await targets(userId)).toEqual([]);

    const started = await asUser(userId, (tx) =>
      startWorkoutSession(tx, created?.workouts[0]?.id ?? "")
    );
    if (started.status !== "started") {
      throw new Error(`Expected a started session, got ${started.status}`);
    }
    await asUser(userId, (tx) => finishWorkoutSession(tx, started.session.id));
    // A repeated finish changes nothing, and records nothing more
    await asUser(userId, (tx) => finishWorkoutSession(tx, started.session.id));

    expect(await targets(userId)).toEqual([4]);
  });

  it("keeps each User's goals to themselves", async () => {
    const owner = newUser("Owner");
    const intruder = newUser("Intruder");
    await create(owner, 3);

    expect(
      await asUser(intruder, (tx) => listWeeklyGoalChanges(tx, owner))
    ).toEqual([]);
    await expect(
      asUser(intruder, (tx) =>
        tx.insert(weeklyGoalChanges).values({ target: 7, userId: owner })
      )
    ).rejects.toThrow();
    await expect(
      asUser(intruder, (tx) =>
        tx
          .update(weeklyGoalChanges)
          .set({ target: 1 })
          .where(eq(weeklyGoalChanges.userId, intruder))
      )
    ).rejects.toThrow();
    expect(await targets(owner)).toEqual([3]);
  });

  it("is deleted with the User's data", async () => {
    const userId = newUser("Deleted");
    await create(userId, 3);

    await withUserTablesLocked((tx) => deleteUserData(tx, userId));

    const left = await withService((tx) =>
      tx
        .select({ id: weeklyGoalChanges.id })
        .from(weeklyGoalChanges)
        .where(eq(weeklyGoalChanges.userId, userId))
    );
    expect(left).toEqual([]);
  });
});
