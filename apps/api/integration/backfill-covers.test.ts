import { randomBytes } from "node:crypto";

import { asUser } from "@fitme/db";
import type { LibraryIndex } from "@fitme/library-bundle/library-index";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan, deletePlan, getPlan } from "@fitme/services/plans";
import { addExerciseToWorkout } from "@fitme/services/workout-edits";
import { afterAll, describe, expect, it } from "vitest";

import { backfillCovers, NoCoversError } from "../src/backfill-covers.js";
import { LibraryIndexUnavailableError } from "../src/library.js";
import {
  libraryCover as cover,
  libraryExercise as exercise,
  testLibraryIndex,
} from "../src/test/harness.js";

/**
 * The Cover backfill against the local stack's pooler, with a Library index in
 * memory.
 * Other test files write Plans in parallel on the same stack, so every run is
 * scoped to this file's Plans (`planIds`).
 */

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("backfill");

const EXERCISES = [
  exercise("barbell-back-squat", ["quadriceps"]),
  exercise("barbell-bench-press", ["chest"]),
  exercise("barbell-deadlift", ["hamstrings"]),
];

const LEGS = "00000000-0000-4000-8000-000000000001";
const CHEST = "00000000-0000-4000-8000-000000000002";
const BACK = "00000000-0000-4000-8000-000000000003";

const COVERS = [
  cover(LEGS, ["quadriceps"]),
  cover(CHEST, ["chest"]),
  cover(BACK, ["hamstrings"]),
  cover("00000000-0000-4000-8000-000000000004", ["biceps"]),
];

const silent = () => {};

/** An index over `EXERCISES` and `covers`; `loading: "fail"` for one that can't load. */
const indexOf = (
  options: Partial<Parameters<typeof testLibraryIndex>[0]> = {}
): LibraryIndex =>
  testLibraryIndex({
    covers: COVERS,
    exercises: EXERCISES,
    reportError: () => Promise.resolve(),
    ...options,
  }).index;

const index = indexOf();

const workout = (slug: string, coverId?: string) => ({
  cover: coverId,
  description: slug,
  exercises: [
    {
      exercise_slug: slug,
      sets: [
        { reps_recommended: 8, rest_recommended: 90, weight_recommended: 60 },
      ],
    },
  ],
  name: slug,
});

/** A Plan of `workouts`, created inactive so other Plans stay as they are. */
const seedPlan = async (workouts: ReturnType<typeof workout>[]) => {
  const plan = await asUser(owner, (tx) =>
    createPlan(
      tx,
      owner,
      {
        description: "Backfill",
        experience_level: "intermediate",
        frequency: 3,
        goal: "muscle-gain",
        name: "Backfill",
        place: "gym",
        workout_duration: 60,
        workouts,
      },
      { activate: false }
    )
  );

  return plan.id;
};

const coversOf = async (planId: string) => {
  const plan = await asUser(owner, (tx) => getPlan(tx, owner, planId));

  return plan?.workouts.map((w) => w.cover) ?? [];
};

describe("cover backfill", () => {
  afterAll(() => deleteTestUsers([owner]));

  it("covers every Workout of a Plan with distinct Covers matching its top muscle group", async () => {
    const planId = await seedPlan([
      workout("barbell-back-squat"),
      workout("barbell-bench-press"),
      workout("barbell-deadlift"),
    ]);

    const report = await backfillCovers({
      index,
      log: silent,
      planIds: [planId],
    });

    expect(report).toStrictEqual({
      plans: [{ covered: 3, planId }],
      written: 3,
    });
    await expect(coversOf(planId)).resolves.toStrictEqual([LEGS, CHEST, BACK]);
  });

  it("keeps existing Covers and counts them as used", async () => {
    const kept = LEGS;

    const planId = await seedPlan([
      workout("barbell-back-squat", kept),
      workout("barbell-back-squat"),
    ]);

    await backfillCovers({ index, log: silent, planIds: [planId] });

    const [first, second] = await coversOf(planId);
    expect(first).toBe(kept);
    expect(second).not.toBeNull();
    expect(second).not.toBe(kept);
  });

  it("skips soft-deleted Plans", async () => {
    const planId = await seedPlan([workout("barbell-back-squat")]);
    await asUser(owner, (tx) => deletePlan(tx, owner, planId));

    const report = await backfillCovers({
      index,
      log: silent,
      planIds: [planId],
    });

    expect(report).toStrictEqual({ plans: [], written: 0 });

    const covers = await asUser(owner, (tx) =>
      tx.query.workouts.findMany({
        columns: { cover: true },
        where: (w, { eq }) => eq(w.planId, planId),
      })
    );

    expect(covers).toStrictEqual([{ cover: null }]);
  });

  it("changes nothing on a second run", async () => {
    const planId = await seedPlan([
      workout("barbell-back-squat"),
      workout("barbell-bench-press"),
    ]);

    await backfillCovers({ index, log: silent, planIds: [planId] });
    const first = await coversOf(planId);

    const report = await backfillCovers({
      index,
      log: silent,
      planIds: [planId],
    });

    expect(report).toStrictEqual({ plans: [], written: 0 });
    await expect(coversOf(planId)).resolves.toStrictEqual(first);
  });

  it("writes nothing on a dry run and logs counts by Plan id only", async () => {
    const planId = await seedPlan([
      workout("barbell-back-squat"),
      workout("barbell-bench-press"),
    ]);

    const lines: string[] = [];

    const report = await backfillCovers({
      dryRun: true,
      index,
      log: (line) => lines.push(line),
      planIds: [planId],
    });

    expect(report).toStrictEqual({
      plans: [{ covered: 2, planId }],
      written: 0,
    });
    await expect(coversOf(planId)).resolves.toStrictEqual([null, null]);
    expect(lines.join("\n")).toContain(planId);

    const loggedDetails = [owner, "barbell", "Backfill"].filter((detail) =>
      lines.join("\n").includes(detail)
    );

    expect(loggedDetails).toStrictEqual([]);
  });

  it("still covers a Workout whose Exercise the Library doesn't know", async () => {
    const planId = await seedPlan([workout("retired-exercise")]);

    await backfillCovers({ index, log: silent, planIds: [planId] });

    const [only] = await coversOf(planId);
    expect(COVERS.map((c) => c.id)).toContain(only);
  });

  it("looks up an Exercise added to a Workout during the run", async () => {
    const planId = await seedPlan([workout("barbell-back-squat")]);
    const plan = await asUser(owner, (tx) => getPlan(tx, owner, planId));
    const workoutId = plan?.workouts[0]?.id ?? "";

    // Two chest Exercises arrive between the listing and the Plan's
    // transaction: chest becomes the Workout's most-trained muscle group
    const changing: LibraryIndex = {
      lookup: async (slugs) => {
        const answer = await index.lookup(slugs);

        if (slugs.length > 0 && !slugs.includes("barbell-bench-press")) {
          const addChestExercise = () =>
            asUser(owner, (tx) =>
              addExerciseToWorkout(tx, owner, {
                exerciseSlug: "barbell-bench-press",
                sets: [
                  {
                    reps_recommended: 8,
                    rest_recommended: 90,
                    weight_recommended: 40,
                  },
                ],
                workoutId,
              })
            );

          await addChestExercise();
          await addChestExercise();
        }

        return answer;
      },
    };

    await backfillCovers({ index: changing, log: silent, planIds: [planId] });

    await expect(coversOf(planId)).resolves.toStrictEqual([CHEST]);
  });

  it("refuses to run when the Library has no Covers", async () => {
    const planId = await seedPlan([workout("barbell-back-squat")]);

    await expect(
      backfillCovers({
        index: indexOf({ covers: [] }),
        log: silent,
        planIds: [planId],
      })
    ).rejects.toBeInstanceOf(NoCoversError);
    await expect(coversOf(planId)).resolves.toStrictEqual([null]);
  });

  it("writes nothing when the Library index can't be loaded", async () => {
    const planId = await seedPlan([workout("barbell-back-squat")]);

    await expect(
      backfillCovers({
        index: indexOf({ loading: "fail" }),
        log: silent,
        planIds: [planId],
      })
    ).rejects.toBeInstanceOf(LibraryIndexUnavailableError);
    await expect(coversOf(planId)).resolves.toStrictEqual([null]);
  });
});
