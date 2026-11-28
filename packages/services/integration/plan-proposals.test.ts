import { randomUUID } from "node:crypto";

import { asUser, withService, workoutSessions } from "@fitme/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { planVersion, savePlanProposal } from "../src/plan-proposals";
import type { PlanProposal } from "../src/plan-proposals";
import { applyPlanUpdate } from "../src/plan-update";
import { createPlan, getPlan, savePlan } from "../src/plans";
import type { NewPlan, PlanDetail, SavedPlanWorkout } from "../src/plans";
import {
  addSetToWorkoutSessionExercise,
  finishWorkoutSession,
  startWorkoutSession,
} from "../src/workout-sessions";
import { deleteTestUsers } from "./delete-test-users";

/**
 * The Plan Proposal save on a local Supabase stack via the Supavisor pooler
 * as the fitme login. Each case creates its own Plan for its own made-up
 * Clerk-style User, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const users: string[] = [];

const newUser = (name: string) => {
  const id = `user_svcProposal${name}${runId}`;
  users.push(id);

  return id;
};

const intruder = newUser("Intruder");

const pushCover = randomUUID();
const legsCover = randomUUID();
const newCover = randomUUID();

const benchSlug = `test-bench-${runId}`;
const squatSlug = `test-squat-${runId}`;
const rowSlug = `test-row-${runId}`;

const set = (reps: number, weight: number) => ({
  reps_recommended: reps,
  rest_recommended: 90,
  weight_recommended: weight,
});

const twoWorkouts: NewPlan = {
  description: "Two days",
  experience_level: "beginner",
  frequency: 2,
  goal: "strength",
  name: "Proposal plan",
  note: "Keep it",
  place: "gym",
  workout_duration: 45,
  workouts: [
    {
      cover: pushCover,
      description: "Chest first",
      exercises: [
        { exercise_slug: benchSlug, sets: [set(8, 60), set(6, 62.5)] },
        { exercise_slug: squatSlug, sets: [set(5, 100)] },
      ],
      name: "Push",
    },
    {
      cover: legsCover,
      description: "Legs only",
      exercises: [{ exercise_slug: squatSlug, sets: [set(10, 80)] }],
      name: "Legs",
    },
  ],
};

const seed = async (userId: string) =>
  await asUser(userId, async (tx) => await createPlan(tx, userId, twoWorkouts));

const read = async (userId: string, planId: string) => {
  const plan = await asUser(
    userId,
    async (tx) => await getPlan(tx, userId, planId)
  );

  if (plan === null) {
    throw new Error(`Plan ${planId} not found`);
  }

  return plan;
};

const usedCoverIdsSeen: string[][] = [];

const propose = async (
  userId: string,
  planId: string,
  proposal: PlanProposal
) =>
  await asUser(
    userId,
    async (tx) =>
      await savePlanProposal(tx, userId, planId, proposal, {
        coverNewWorkouts: (newWorkouts, usedCoverIds) => {
          usedCoverIdsSeen.push(usedCoverIds);

          return newWorkouts.map(() => newCover);
        },
      })
  );

/** A Workout as read, as a proposal sends it back. */
const sent = (plan: PlanDetail, name: string): SavedPlanWorkout => {
  const workout = plan.workouts.find((w) => w.name === name);

  if (workout === undefined) {
    throw new Error(`No Workout ${name}`);
  }

  return {
    description: workout.description,
    exercises: workout.exercises.map((exercise) => ({
      exercise_slug: exercise.exercise_slug,
      id: exercise.id,
      sets: exercise.sets.map((s) => ({
        id: s.id,
        reps_recommended: s.reps_recommended,
        rest_recommended: s.rest_recommended,
        weight_recommended: s.weight_recommended,
      })),
    })),
    id: workout.id,
    name: workout.name,
  };
};

const workoutId = (plan: PlanDetail, name: string) => sent(plan, name).id ?? "";

/** Starts and finishes a Workout Session of `workout`, logging one set. */
const train = async (userId: string, workout: string) =>
  await asUser(userId, async (tx) => {
    const started = await startWorkoutSession(tx, workout);

    if (started.status !== "started") {
      throw new Error(`Couldn't start: ${started.status}`);
    }

    const [first] = started.session.exercises;
    await addSetToWorkoutSessionExercise(tx, userId, {
      repsCompleted: 12,
      sessionExerciseId: first.id,
      weightCompleted: 70,
    });

    const finished = await finishWorkoutSession(tx, started.session.id);

    if (finished.status !== "finished") {
      throw new Error(`Couldn't finish: ${finished.status}`);
    }

    return started.session.id;
  });

const sessionWorkout = async (sessionId: string) =>
  await withService(async (tx) => {
    const [row] = await tx
      .select({ workoutId: workoutSessions.workoutId })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, sessionId));

    return row?.workoutId;
  });

const noChanges = {
  exercisesAdded: 0,
  exercisesRemoved: 0,
  setsAdded: 0,
  setsChanged: 0,
  setsRemoved: 0,
  workoutsAdded: 0,
  workoutsChanged: 0,
  workoutsRemoved: 0,
};

describe("Plan Proposal save", () => {
  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("answers the same marker for two reads of an unchanged Plan", async () => {
    const owner = newUser("Marker");
    const plan = await seed(owner);

    expect(planVersion(await read(owner, plan.id))).toBe(planVersion(plan));
  });

  it("changes one set and keeps every other row, Cover and session link", async () => {
    const owner = newUser("OneSet");
    const created = await seed(owner);
    const sessionId = await train(owner, workoutId(created, "Push"));
    const before = await read(owner, created.id);

    const push = sent(before, "Push");
    push.exercises[0].sets[1].weight_recommended = 65;

    const result = await propose(owner, created.id, {
      planVersion: planVersion(before),
      workouts: [push],
    });

    expect(result).toStrictEqual({
      changes: { ...noChanges, setsChanged: 1, workoutsChanged: 1 },
      planId: created.id,
      status: "saved",
    });

    const after = await read(owner, created.id);
    const expected = structuredClone(before.workouts);
    const pushAfter = expected.find((w) => w.name === "Push");

    if (pushAfter === undefined) {
      throw new Error("No Push");
    }

    pushAfter.exercises[0].sets[1].weight_recommended = 65;
    expect(after.workouts).toStrictEqual(expected);
    await expect(sessionWorkout(sessionId)).resolves.toBe(
      workoutId(before, "Push")
    );
  });

  it("gives a new Workout a Cover and cuts a removed one's sessions loose", async () => {
    const owner = newUser("AddRemove");
    const created = await seed(owner);
    const legsSession = await train(owner, workoutId(created, "Legs"));
    const before = await read(owner, created.id);
    usedCoverIdsSeen.length = 0;

    const result = await propose(owner, created.id, {
      planVersion: planVersion(before),
      removedWorkoutIds: [workoutId(before, "Legs")],
      workouts: [
        {
          description: "Back",
          exercises: [
            { exercise_slug: rowSlug, sets: [set(10, 40), set(10, 40)] },
          ],
          name: "Pull",
        },
      ],
    });

    expect(result).toStrictEqual({
      changes: {
        ...noChanges,
        exercisesAdded: 1,
        exercisesRemoved: 1,
        setsAdded: 2,
        setsRemoved: 1,
        workoutsAdded: 1,
        workoutsRemoved: 1,
      },
      planId: created.id,
      status: "saved",
    });

    const after = await read(owner, created.id);

    expect(after.workouts.map((w) => [w.name, w.cover])).toStrictEqual([
      ["Push", pushCover],
      ["Pull", newCover],
    ]);
    expect(after.workouts[0]).toStrictEqual(
      before.workouts.find((w) => w.name === "Push")
    );
    expect(usedCoverIdsSeen).toStrictEqual([[pushCover]]);
    await expect(sessionWorkout(legsSession)).resolves.toBeNull();
  });

  it("counts Exercises and sets added, changed and removed in a changed Workout", async () => {
    const owner = newUser("Counts");
    const before = await seed(owner);
    const push = sent(before, "Push");

    // Bench: one set changed, one removed, one added; Squat replaced by Row
    push.exercises[0].sets = [
      { ...push.exercises[0].sets[0], reps_recommended: 10 },
      set(4, 70),
    ];
    push.exercises[1] = { exercise_slug: rowSlug, sets: [set(12, 30)] };

    const result = await propose(owner, before.id, {
      planVersion: planVersion(before),
      workouts: [push],
    });

    expect(result).toStrictEqual({
      changes: {
        ...noChanges,
        exercisesAdded: 1,
        exercisesRemoved: 1,
        setsAdded: 2,
        setsChanged: 1,
        setsRemoved: 2,
        workoutsChanged: 1,
      },
      planId: before.id,
      status: "saved",
    });

    const after = await read(owner, before.id);

    expect(after.workouts.map((w) => w.name)).toStrictEqual(["Push", "Legs"]);
    expect(
      after.workouts[0].exercises.map((e) => [
        e.exercise_slug,
        e.sets.map((s) => [s.reps_recommended, s.weight_recommended]),
      ])
    ).toStrictEqual([
      [
        benchSlug,
        [
          [10, 60],
          [4, 70],
        ],
      ],
      [rowSlug, [[12, 30]]],
    ]);
  });

  it("saves the changed details and keeps the ones not sent", async () => {
    const owner = newUser("Details");
    const before = await seed(owner);

    const result = await propose(owner, before.id, {
      details: { frequency: 3, goal: null, name: "Renamed" },
      planVersion: planVersion(before),
    });

    expect(result).toMatchObject({ changes: noChanges, status: "saved" });

    const after = await read(owner, before.id);

    expect(after).toMatchObject({
      description: "Two days",
      experience_level: "beginner",
      frequency: 3,
      goal: null,
      name: "Renamed",
      note: "Keep it",
      place: "gym",
      workout_duration: 45,
    });
    expect(after.workouts).toStrictEqual(before.workouts);
  });

  const refusedAfter = async (
    name: string,
    change: (owner: string, plan: PlanDetail) => Promise<void>
  ) => {
    const owner = newUser(name);
    const created = await seed(owner);
    const read1 = await read(owner, created.id);
    await change(owner, read1);
    const changed = await read(owner, created.id);

    expect(planVersion(changed)).not.toBe(planVersion(read1));

    const push = sent(read1, "Push");
    push.name = "Never saved";

    const result = await propose(owner, created.id, {
      details: { name: "Never saved" },
      planVersion: planVersion(read1),
      workouts: [push],
    });

    return { after: await read(owner, created.id), changed, result };
  };

  it("is refused after a Plan editor save", async () => {
    const { after, changed, result } = await refusedAfter(
      "EditorSave",
      async (owner, plan) => {
        await asUser(owner, async (tx) => {
          await savePlan(tx, owner, plan.id, {
            ...twoWorkouts,
            workouts: [
              sent(plan, "Push"),
              { ...sent(plan, "Legs"), name: "Leg day" },
            ],
          });
        });
      }
    );

    expect(result).toStrictEqual({ status: "plan_changed" });
    expect(after).toStrictEqual(changed);
  });

  it("is refused after a finished Workout Session rotates its Workout", async () => {
    const { after, changed, result } = await refusedAfter(
      "Rotation",
      async (owner, plan) => {
        await train(owner, workoutId(plan, "Push"));
      }
    );

    expect(result).toStrictEqual({ status: "plan_changed" });
    expect(after).toStrictEqual(changed);
    expect(after.workouts.map((w) => w.name)).toStrictEqual(["Legs", "Push"]);
  });

  it("is refused after an applied Plan Update", async () => {
    const owner = newUser("PlanUpdate");
    const created = await seed(owner);
    const sessionId = await train(owner, workoutId(created, "Push"));
    const read1 = await read(owner, created.id);

    await asUser(owner, async (tx) => {
      const update = await applyPlanUpdate(tx, owner, sessionId);
      expect(update?.changes.length).toBeGreaterThan(0);
    });

    const changed = await read(owner, created.id);
    expect(planVersion(changed)).not.toBe(planVersion(read1));

    await expect(
      propose(owner, created.id, {
        details: { name: "Never saved" },
        planVersion: planVersion(read1),
      })
    ).resolves.toStrictEqual({ status: "plan_changed" });
    await expect(read(owner, created.id)).resolves.toStrictEqual(changed);
  });

  it("applies the same accepted change once", async () => {
    const owner = newUser("Twice");
    const before = await seed(owner);

    const proposal: PlanProposal = {
      planVersion: planVersion(before),
      workouts: [
        {
          description: "",
          exercises: [{ exercise_slug: rowSlug, sets: [set(8, 20)] }],
          name: "Pull",
        },
      ],
    };

    await expect(propose(owner, before.id, proposal)).resolves.toMatchObject({
      status: "saved",
    });

    const once = await read(owner, before.id);

    await expect(propose(owner, before.id, proposal)).resolves.toStrictEqual({
      status: "plan_changed",
    });
    await expect(read(owner, before.id)).resolves.toStrictEqual(once);
    expect(once.workouts.map((w) => w.name)).toStrictEqual([
      "Push",
      "Legs",
      "Pull",
    ]);
  });

  it("answers ids that aren't the Plan's as invalid and writes nothing", async () => {
    const owner = newUser("InvalidIds");
    const before = await seed(owner);
    const stranger = randomUUID();

    await expect(
      propose(owner, before.id, {
        planVersion: planVersion(before),
        removedWorkoutIds: [stranger],
      })
    ).resolves.toStrictEqual({ ids: [stranger], status: "invalid_ids" });

    const push = sent(before, "Push");
    push.exercises[0].sets[0].id = randomUUID();

    await expect(
      propose(owner, before.id, {
        planVersion: planVersion(before),
        workouts: [push],
      })
    ).resolves.toMatchObject({ status: "invalid_ids" });
    await expect(read(owner, before.id)).resolves.toStrictEqual(before);
  });

  it("refuses to remove every Workout and writes nothing", async () => {
    const owner = newUser("Emptied");
    const before = await seed(owner);

    await expect(
      propose(owner, before.id, {
        planVersion: planVersion(before),
        removedWorkoutIds: before.workouts.map((w) => w.id),
      })
    ).resolves.toStrictEqual({ status: "no_workouts" });
    await expect(read(owner, before.id)).resolves.toStrictEqual(before);
  });

  it("counts kept rows sent with uppercase ids as kept", async () => {
    const owner = newUser("Uppercase");
    const before = await seed(owner);
    const push = sent(before, "Push");

    const upper = {
      ...push,
      exercises: push.exercises.map((exercise) => ({
        ...exercise,
        id: exercise.id?.toUpperCase(),
        sets: exercise.sets.map((s) => ({ ...s, id: s.id?.toUpperCase() })),
      })),
      id: push.id?.toUpperCase(),
    };

    await expect(
      propose(owner, before.id, {
        planVersion: planVersion(before),
        workouts: [upper],
      })
    ).resolves.toStrictEqual({
      changes: noChanges,
      planId: before.id,
      status: "saved",
    });
    const after = await read(owner, before.id);

    expect(after.workouts).toStrictEqual(before.workouts);
  });

  it("doesn't find another User's Plan", async () => {
    const owner = newUser("Owner");
    const before = await seed(owner);

    await expect(
      propose(intruder, before.id, {
        details: { name: "Taken" },
        planVersion: planVersion(before),
      })
    ).resolves.toStrictEqual({ status: "not_found" });
    await expect(read(owner, before.id)).resolves.toStrictEqual(before);
  });
});
