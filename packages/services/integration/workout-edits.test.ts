import { randomUUID } from "node:crypto";
import {
  asUser,
  plans,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workouts,
} from "@fitme/db";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { deleteUserData } from "../src/delete-user-data";
import { deletePlan, getPlan } from "../src/plans";
import {
  addExerciseToWorkout,
  addSetToExercise,
  MAX_SETS_PER_EXERCISE,
  removeExerciseFromWorkout,
  removeSetFromExercise,
  replaceExerciseInWorkout,
  TooManySetsError,
  updateSetRecommendations,
} from "../src/workout-edits";
import { withUserTablesLocked } from "./delete-test-users";

/**
 * Arnold's Plan edits through asUser, against a local Supabase stack via
 * the Supavisor pooler as the fitme login. Made-up Clerk-style User ids,
 * unique per run; every test edits a Plan of its own.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcEditOwner${runId}`;
const intruder = `user_svcEditIntruder${runId}`;
const leaver = `user_svcEditLeaver${runId}`;

// Past int4: a sets insert fails after the rows before it went in
const OUT_OF_RANGE_REPS = 2 ** 31;
const NUMERIC_OUT_OF_RANGE = "22003";

const benchSlug = `edit-bench-${runId}`;
const squatSlug = `edit-squat-${runId}`;
const rowSlug = `edit-row-${runId}`;
/** Postgres doesn't check slugs (ADR 0010): any string is stored as given. */
const unknownSlug = `not-in-any-library-${runId}`;

/**
 * A Plan with one Workout, Day A: Bench (sets 8×60, 6×62.5) then Squat
 * (5×100).
 */
const seedPlan = (userId: string) =>
  withService(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        description: "Edit me",
        frequency: 3,
        goal: "muscle-gain",
        name: "Edit plan",
        place: "gym",
        userId,
      })
      .returning({ id: plans.id });
    const [dayA] = await tx
      .insert(workouts)
      .values({ description: "Push", name: "Day A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });
    const [bench, squat] = await tx
      .insert(workoutExercises)
      .values([
        { exerciseSlug: benchSlug, order: 1, workoutId: dayA.id },
        { exerciseSlug: squatSlug, order: 2, workoutId: dayA.id },
      ])
      .returning({ id: workoutExercises.id });
    const [benchSet1, benchSet2, squatSet] = await tx
      .insert(workoutExerciseSets)
      .values([
        {
          order: 1,
          repsRecommended: 8,
          restRecommended: 90,
          weightRecommended: "60.00",
          workoutExerciseId: bench.id,
        },
        {
          order: 2,
          repsRecommended: 6,
          restRecommended: 120,
          weightRecommended: "62.50",
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
      id: plan.id,
      squat: squat.id,
      squatSet: squatSet.id,
    };
  });

type SeededPlan = Awaited<ReturnType<typeof seedPlan>>;

/** Day A of the seeded Plan as the owner sees it. */
const dayAOf = async (plan: SeededPlan, userId = owner) => {
  const detail = await withService((tx) => getPlan(tx, userId, plan.id));
  return detail?.workouts[0];
};

/** Each Exercise of Day A with its sets as [order, reps, weight, rest]. */
const shapeOf = async (plan: SeededPlan, userId = owner) =>
  (await dayAOf(plan, userId))?.exercises.map((exercise) => ({
    exercise: exercise.exercise_slug,
    order: exercise.order,
    sets: exercise.sets.map((set) => [
      set.order,
      set.reps_recommended,
      set.weight_recommended,
      set.rest_recommended,
    ]),
  }));

const seededShape = [
  {
    exercise: benchSlug,
    order: 1,
    sets: [
      [1, 8, 60, 90],
      [2, 6, 62.5, 120],
    ],
  },
  { exercise: squatSlug, order: 2, sets: [[1, 5, 100, 180]] },
];

const newKey = () => `test-${randomUUID()}`;

afterAll(async () => {
  await withService(async (tx) => {
    await tx
      .delete(plans)
      .where(inArray(plans.userId, [owner, intruder, leaver]));
  });
});

const newSet = {
  reps_recommended: 10,
  rest_recommended: 60,
  weight_recommended: 55,
};

describe("addSetToExercise", () => {
  it("appends the set after the Exercise's last set", async () => {
    const plan = await seedPlan(owner);

    const added = await asUser(owner, (tx) =>
      addSetToExercise(tx, owner, {
        set: newSet,
        workoutExerciseId: plan.bench,
      })
    );

    expect(added).toEqual({ id: expect.any(String), order: 3 });
    expect(await shapeOf(plan)).toEqual([
      {
        ...seededShape[0],
        sets: [...seededShape[0].sets, [3, 10, 55, 60]],
      },
      seededShape[1],
    ]);
  });

  it("adds the set once when the call is repeated with its request key", async () => {
    const plan = await seedPlan(owner);
    const requestKey = newKey();
    const add = () =>
      asUser(owner, (tx) =>
        addSetToExercise(tx, owner, {
          requestKey,
          set: newSet,
          workoutExerciseId: plan.bench,
        })
      );

    const first = await add();
    const retried = await add();

    expect(retried).toEqual(first);
    expect((await shapeOf(plan))?.[0].sets).toHaveLength(3);
  });

  it("numbers concurrent appends without gaps or duplicates", async () => {
    const plan = await seedPlan(owner);

    await Promise.all(
      [1, 2, 3].map(() =>
        asUser(owner, (tx) =>
          addSetToExercise(tx, owner, {
            set: newSet,
            workoutExerciseId: plan.squat,
          })
        )
      )
    );

    expect((await shapeOf(plan))?.[1].sets.map(([order]) => order)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("refuses a set past the limit, but still answers a repeat of the last one", async () => {
    const plan = await seedPlan(owner);
    const requestKey = newKey();
    const add = (key?: string) =>
      asUser(owner, (tx) =>
        addSetToExercise(tx, owner, {
          requestKey: key,
          set: newSet,
          workoutExerciseId: plan.squat,
        })
      );
    // The squat starts with one set; fill it up to one short of the limit
    await Promise.all(
      Array.from({ length: MAX_SETS_PER_EXERCISE - 2 }, () => add())
    );
    const last = await add(requestKey);

    await expect(add()).rejects.toEqual(
      new TooManySetsError(MAX_SETS_PER_EXERCISE)
    );
    expect(await add(requestKey)).toEqual(last);
    expect((await shapeOf(plan))?.[1].sets).toHaveLength(MAX_SETS_PER_EXERCISE);
  });

  it("can't add to another User's Exercise", async () => {
    const plan = await seedPlan(owner);

    const added = await asUser(intruder, (tx) =>
      addSetToExercise(tx, intruder, {
        set: newSet,
        workoutExerciseId: plan.bench,
      })
    );

    expect(added).toBeNull();
    expect(await shapeOf(plan)).toEqual(seededShape);
  });

  it("leaves nothing changed when the insert fails", async () => {
    const plan = await seedPlan(owner);

    await expect(
      asUser(owner, (tx) =>
        addSetToExercise(tx, owner, {
          set: { ...newSet, reps_recommended: OUT_OF_RANGE_REPS },
          workoutExerciseId: plan.bench,
        })
      )
    ).rejects.toMatchObject({ cause: { code: NUMERIC_OUT_OF_RANGE } });
    expect(await shapeOf(plan)).toEqual(seededShape);
  });

  it("edits a Workout of a soft-deleted Plan, as ai-agent did", async () => {
    const plan = await seedPlan(owner);
    await asUser(owner, (tx) => deletePlan(tx, owner, plan.id));

    const added = await asUser(owner, (tx) =>
      addSetToExercise(tx, owner, {
        set: newSet,
        workoutExerciseId: plan.bench,
      })
    );

    expect(added).toEqual({ id: expect.any(String), order: 3 });
  });
});

describe("addExerciseToWorkout", () => {
  const sets = [
    { reps_recommended: 12, rest_recommended: 60, weight_recommended: 40 },
    { reps_recommended: 10, rest_recommended: 75, weight_recommended: 45 },
  ];

  it("appends the Exercise with its sets in order after the last one", async () => {
    const plan = await seedPlan(owner);

    const added = await asUser(owner, (tx) =>
      addExerciseToWorkout(tx, owner, {
        exerciseSlug: rowSlug,
        sets,
        workoutId: plan.dayA,
      })
    );

    expect(added).toEqual({ id: expect.any(String), order: 3, setsAdded: 2 });
    expect(await shapeOf(plan)).toEqual([
      ...seededShape,
      {
        exercise: rowSlug,
        order: 3,
        sets: [
          [1, 12, 40, 60],
          [2, 10, 45, 75],
        ],
      },
    ]);
  });

  it("stores any Exercise slug as given, unchecked", async () => {
    const plan = await seedPlan(owner);

    await asUser(owner, (tx) =>
      addExerciseToWorkout(tx, owner, {
        exerciseSlug: unknownSlug,
        sets,
        workoutId: plan.dayA,
      })
    );

    expect((await dayAOf(plan))?.exercises[2]).toMatchObject({
      exercise_slug: unknownSlug,
      order: 3,
    });
  });

  it("adds the Exercise once when the call is repeated with its request key", async () => {
    const plan = await seedPlan(owner);
    const requestKey = newKey();
    const add = () =>
      asUser(owner, (tx) =>
        addExerciseToWorkout(tx, owner, {
          exerciseSlug: rowSlug,
          requestKey,
          sets,
          workoutId: plan.dayA,
        })
      );

    const first = await add();
    const retried = await add();

    expect(retried).toEqual(first);
    expect(await shapeOf(plan)).toHaveLength(3);
    expect((await shapeOf(plan))?.[2].sets).toHaveLength(2);
  });

  it("can't add to another User's Workout", async () => {
    const plan = await seedPlan(owner);

    const added = await asUser(intruder, (tx) =>
      addExerciseToWorkout(tx, intruder, {
        exerciseSlug: rowSlug,
        sets,
        workoutId: plan.dayA,
      })
    );

    expect(added).toBeNull();
    expect(await shapeOf(plan)).toEqual(seededShape);
  });

  it("leaves nothing changed when a set fails after the Exercise went in", async () => {
    const plan = await seedPlan(owner);

    await expect(
      asUser(owner, (tx) =>
        addExerciseToWorkout(tx, owner, {
          exerciseSlug: rowSlug,
          sets: [sets[0], { ...sets[1], reps_recommended: OUT_OF_RANGE_REPS }],
          workoutId: plan.dayA,
        })
      )
    ).rejects.toMatchObject({ cause: { code: NUMERIC_OUT_OF_RANGE } });
    expect(await shapeOf(plan)).toEqual(seededShape);
  });
});

describe("removeExerciseFromWorkout", () => {
  it("removes the Exercise with its sets and renumbers the rest from 1", async () => {
    const plan = await seedPlan(owner);

    const removed = await asUser(owner, (tx) =>
      removeExerciseFromWorkout(tx, owner, plan.bench)
    );

    expect(removed).toBe(true);
    expect(await shapeOf(plan)).toEqual([{ ...seededShape[1], order: 1 }]);
    const orphanSets = await withService((tx) =>
      tx
        .select({ id: workoutExerciseSets.id })
        .from(workoutExerciseSets)
        .where(
          inArray(workoutExerciseSets.id, [plan.benchSet1, plan.benchSet2])
        )
    );
    expect(orphanSets).toEqual([]);
  });

  it("changes nothing more when the call is repeated", async () => {
    const plan = await seedPlan(owner);
    const remove = () =>
      asUser(owner, (tx) => removeExerciseFromWorkout(tx, owner, plan.bench));

    await remove();
    const retried = await remove();

    expect(retried).toBe(false);
    expect(await shapeOf(plan)).toEqual([{ ...seededShape[1], order: 1 }]);
  });

  it("can't remove from another User's Workout", async () => {
    const plan = await seedPlan(owner);

    const removed = await asUser(intruder, (tx) =>
      removeExerciseFromWorkout(tx, intruder, plan.bench)
    );

    expect(removed).toBe(false);
    expect(await shapeOf(plan)).toEqual(seededShape);
  });
});

describe("replaceExerciseInWorkout", () => {
  const sets = [
    { reps_recommended: 12, rest_recommended: 60, weight_recommended: 40 },
  ];
  const replacedShape = [
    { exercise: rowSlug, order: 1, sets: [[1, 12, 40, 60]] },
    seededShape[1],
  ];

  it("swaps the Exercise in place and replaces its sets", async () => {
    const plan = await seedPlan(owner);

    const replaced = await asUser(owner, (tx) =>
      replaceExerciseInWorkout(tx, owner, {
        newExerciseSlug: rowSlug,
        sets,
        workoutExerciseId: plan.bench,
      })
    );

    expect(replaced).toBe(true);
    expect(await shapeOf(plan)).toEqual(replacedShape);
    expect((await dayAOf(plan))?.exercises[0].id).toBe(plan.bench);
  });

  it("ends in the same state when the call is repeated", async () => {
    const plan = await seedPlan(owner);
    const replace = () =>
      asUser(owner, (tx) =>
        replaceExerciseInWorkout(tx, owner, {
          newExerciseSlug: rowSlug,
          sets,
          workoutExerciseId: plan.bench,
        })
      );

    await replace();
    const retried = await replace();

    expect(retried).toBe(true);
    expect(await shapeOf(plan)).toEqual(replacedShape);
  });

  it("keeps the set ids when the replacement is already in place", async () => {
    const plan = await seedPlan(owner);
    // numeric(8,2) stores 1.01; a binary float's toFixed(2) says "1.00"
    const roundingBoundary = [{ ...sets[0], weight_recommended: 1.005 }];
    const replace = () =>
      asUser(owner, (tx) =>
        replaceExerciseInWorkout(tx, owner, {
          newExerciseSlug: rowSlug,
          sets: roundingBoundary,
          workoutExerciseId: plan.bench,
        })
      );
    const setIds = async () =>
      (await dayAOf(plan))?.exercises[0].sets.map((set) => set.id);

    await replace();
    const firstIds = await setIds();
    await replace();

    expect(await setIds()).toEqual(firstIds);
  });

  it("can't replace in another User's Workout", async () => {
    const plan = await seedPlan(owner);

    const replaced = await asUser(intruder, (tx) =>
      replaceExerciseInWorkout(tx, intruder, {
        newExerciseSlug: rowSlug,
        sets,
        workoutExerciseId: plan.bench,
      })
    );

    expect(replaced).toBe(false);
    expect(await shapeOf(plan)).toEqual(seededShape);
  });

  it("swaps in any Exercise slug as given, unchecked", async () => {
    const plan = await seedPlan(owner);

    const replaced = await asUser(owner, (tx) =>
      replaceExerciseInWorkout(tx, owner, {
        newExerciseSlug: unknownSlug,
        sets,
        workoutExerciseId: plan.bench,
      })
    );

    expect(replaced).toBe(true);
    expect((await dayAOf(plan))?.exercises[0]).toMatchObject({
      exercise_slug: unknownSlug,
      id: plan.bench,
    });
  });

  it("leaves nothing changed when the new sets fail to go in", async () => {
    const plan = await seedPlan(owner);

    await expect(
      asUser(owner, (tx) =>
        replaceExerciseInWorkout(tx, owner, {
          newExerciseSlug: rowSlug,
          sets: [{ ...sets[0], reps_recommended: OUT_OF_RANGE_REPS }],
          workoutExerciseId: plan.bench,
        })
      )
    ).rejects.toMatchObject({ cause: { code: NUMERIC_OUT_OF_RANGE } });
    expect(await shapeOf(plan)).toEqual(seededShape);
  });
});

describe("removeSetFromExercise", () => {
  const benchWithoutFirstSet = [
    { ...seededShape[0], sets: [[1, 6, 62.5, 120]] },
    seededShape[1],
  ];

  it("removes the set and renumbers the Exercise's other sets from 1", async () => {
    const plan = await seedPlan(owner);

    const removed = await asUser(owner, (tx) =>
      removeSetFromExercise(tx, owner, plan.benchSet1)
    );

    expect(removed).toBe(true);
    expect(await shapeOf(plan)).toEqual(benchWithoutFirstSet);
  });

  it("changes nothing more when the call is repeated", async () => {
    const plan = await seedPlan(owner);
    const remove = () =>
      asUser(owner, (tx) => removeSetFromExercise(tx, owner, plan.benchSet1));

    await remove();
    const retried = await remove();

    expect(retried).toBe(false);
    expect(await shapeOf(plan)).toEqual(benchWithoutFirstSet);
  });

  it("can't remove another User's set", async () => {
    const plan = await seedPlan(owner);

    const removed = await asUser(intruder, (tx) =>
      removeSetFromExercise(tx, intruder, plan.benchSet1)
    );

    expect(removed).toBe(false);
    expect(await shapeOf(plan)).toEqual(seededShape);
  });
});

describe("updateSetRecommendations", () => {
  const updatedShape = [
    {
      ...seededShape[0],
      sets: [
        [1, 8, 65, 90],
        [2, 6, 62.5, 120],
      ],
    },
    seededShape[1],
  ];

  it("changes only the given targets and returns the set", async () => {
    const plan = await seedPlan(owner);

    const updated = await asUser(owner, (tx) =>
      updateSetRecommendations(tx, owner, plan.benchSet1, {
        weight_recommended: 65,
      })
    );

    expect(updated).toEqual({
      id: plan.benchSet1,
      order: 1,
      reps_recommended: 8,
      rest_recommended: 90,
      weight_recommended: 65,
    });
    expect(await shapeOf(plan)).toEqual(updatedShape);
  });

  it("ends in the same state when the call is repeated", async () => {
    const plan = await seedPlan(owner);
    const update = () =>
      asUser(owner, (tx) =>
        updateSetRecommendations(tx, owner, plan.benchSet1, {
          weight_recommended: 65,
        })
      );

    const first = await update();
    const retried = await update();

    expect(retried).toEqual(first);
    expect(await shapeOf(plan)).toEqual(updatedShape);
  });

  it("can't update another User's set", async () => {
    const plan = await seedPlan(owner);

    const updated = await asUser(intruder, (tx) =>
      updateSetRecommendations(tx, intruder, plan.benchSet1, {
        reps_recommended: 1,
      })
    );

    expect(updated).toBeNull();
    expect(await shapeOf(plan)).toEqual(seededShape);
  });

  it("edits a set in a soft-deleted Plan, as ai-agent did", async () => {
    const plan = await seedPlan(owner);
    await asUser(owner, (tx) => deletePlan(tx, owner, plan.id));

    const updated = await asUser(owner, (tx) =>
      updateSetRecommendations(tx, owner, plan.benchSet1, {
        rest_recommended: 30,
      })
    );

    expect(updated).toMatchObject({ id: plan.benchSet1, rest_recommended: 30 });
  });

  it("leaves the set unchanged when a target is out of range", async () => {
    const plan = await seedPlan(owner);

    await expect(
      asUser(owner, (tx) =>
        updateSetRecommendations(tx, owner, plan.benchSet1, {
          reps_recommended: OUT_OF_RANGE_REPS,
          weight_recommended: 65,
        })
      )
    ).rejects.toMatchObject({ cause: { code: NUMERIC_OUT_OF_RANGE } });
    expect(await shapeOf(plan)).toEqual(seededShape);
  });
});

describe("edits during account deletion", () => {
  const DELETION_HOLDS_LOCKS_MS = 1500;

  it("queue behind deleteUserData instead of deadlocking with it", async () => {
    const plan = await seedPlan(leaver);
    let edit: Promise<unknown> | undefined;

    // deleteUserData's first statement: every User table, share row
    // exclusive, in its order, taken without waiting so a transaction from a
    // test file running alongside can't deadlock with it
    await withUserTablesLocked(async (tx) => {
      edit = asUser(leaver, (editTx) =>
        addSetToExercise(editTx, leaver, {
          set: newSet,
          workoutExerciseId: plan.bench,
        })
      );
      // Let the edit get as far as it can before the cascade needs its rows
      await new Promise((resolve) =>
        setTimeout(resolve, DELETION_HOLDS_LOCKS_MS)
      );
      await deleteUserData(tx, leaver);
    });

    // The Plan is gone, so the edit finds nothing to add to
    await expect(edit).resolves.toBeNull();
  });
});
