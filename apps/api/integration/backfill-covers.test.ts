import { randomBytes } from "node:crypto";
import type { MuscleGroup } from "@fitme/core";
import { asUser } from "@fitme/db";
import type { Cover, ExerciseSummary } from "@fitme/library-sdk";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan, deletePlan, getPlan } from "@fitme/services/plans";
import { afterAll, describe, expect, it } from "vitest";
import { backfillCovers, NoCoversError } from "../src/backfill-covers.js";

/**
 * The Cover backfill against the local stack's pooler, with the fake Library.
 * Other test files write Plans in parallel on the same stack, so every run is
 * scoped to this file's Plans (`planIds`).
 */

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("backfill");
afterAll(() => deleteTestUsers([owner]));

const exercise = (
  slug: string,
  muscleGroups: MuscleGroup[]
): ExerciseSummary => ({
  muscle_groups: muscleGroups,
  name: slug,
  slug,
  thumbnail_url: `https://media.example/${slug}.png`,
  video_url: `https://media.example/${slug}.mp4`,
});

const cover = (id: string, muscleGroups: MuscleGroup[]): Cover => ({
  id,
  image_url: `https://media.example/covers/${id}.jpg`,
  muscle_groups: muscleGroups,
});

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

const library = createFakeLibrary(EXERCISES, { covers: COVERS });

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

const silent = () => undefined;

describe("backfillCovers", () => {
  it("covers every Workout of a Plan with distinct Covers matching its top muscle group", async () => {
    const planId = await seedPlan([
      workout("barbell-back-squat"),
      workout("barbell-bench-press"),
      workout("barbell-deadlift"),
    ]);

    const report = await backfillCovers({
      library,
      log: silent,
      planIds: [planId],
    });

    expect(report).toEqual({ plans: [{ covered: 3, planId }], written: 3 });
    expect(await coversOf(planId)).toEqual([LEGS, CHEST, BACK]);
  });

  it("keeps existing Covers and counts them as used", async () => {
    const kept = LEGS;
    const planId = await seedPlan([
      workout("barbell-back-squat", kept),
      workout("barbell-back-squat"),
    ]);

    await backfillCovers({ library, log: silent, planIds: [planId] });

    const [first, second] = await coversOf(planId);
    expect(first).toBe(kept);
    expect(second).not.toBeNull();
    expect(second).not.toBe(kept);
  });

  it("skips soft-deleted Plans", async () => {
    const planId = await seedPlan([workout("barbell-back-squat")]);
    await asUser(owner, (tx) => deletePlan(tx, owner, planId));

    const report = await backfillCovers({
      library,
      log: silent,
      planIds: [planId],
    });

    expect(report).toEqual({ plans: [], written: 0 });
    const covers = await asUser(owner, (tx) =>
      tx.query.workouts.findMany({
        columns: { cover: true },
        where: (w, { eq }) => eq(w.planId, planId),
      })
    );
    expect(covers).toEqual([{ cover: null }]);
  });

  it("changes nothing on a second run", async () => {
    const planId = await seedPlan([
      workout("barbell-back-squat"),
      workout("barbell-bench-press"),
    ]);
    await backfillCovers({ library, log: silent, planIds: [planId] });
    const first = await coversOf(planId);

    const report = await backfillCovers({
      library,
      log: silent,
      planIds: [planId],
    });

    expect(report).toEqual({ plans: [], written: 0 });
    expect(await coversOf(planId)).toEqual(first);
  });

  it("writes nothing on a dry run and logs counts by Plan id only", async () => {
    const planId = await seedPlan([
      workout("barbell-back-squat"),
      workout("barbell-bench-press"),
    ]);
    const lines: string[] = [];

    const report = await backfillCovers({
      dryRun: true,
      library,
      log: (line) => lines.push(line),
      planIds: [planId],
    });

    expect(report).toEqual({ plans: [{ covered: 2, planId }], written: 0 });
    expect(await coversOf(planId)).toEqual([null, null]);
    expect(lines.join("\n")).toContain(planId);
    expect(lines.join("\n")).not.toContain(owner);
    expect(lines.join("\n")).not.toContain("barbell");
    expect(lines.join("\n")).not.toContain("Backfill");
  });

  it("still covers a Workout whose Exercise the Library doesn't know", async () => {
    const planId = await seedPlan([workout("retired-exercise")]);

    await backfillCovers({ library, log: silent, planIds: [planId] });

    const [only] = await coversOf(planId);
    expect(COVERS.map((c) => c.id)).toContain(only);
  });

  it("refuses to run when the Library has no Covers", async () => {
    const planId = await seedPlan([workout("barbell-back-squat")]);

    await expect(
      backfillCovers({
        library: createFakeLibrary(EXERCISES),
        log: silent,
        planIds: [planId],
      })
    ).rejects.toBeInstanceOf(NoCoversError);
    expect(await coversOf(planId)).toEqual([null]);
  });

  it("writes nothing when the Library fails", async () => {
    const planId = await seedPlan([workout("barbell-back-squat")]);
    const failing = createFakeLibrary(EXERCISES, { covers: COVERS });
    failing.failWith(new LibraryUnavailableError());

    await expect(
      backfillCovers({ library: failing, log: silent, planIds: [planId] })
    ).rejects.toBeInstanceOf(LibraryUnavailableError);
    expect(await coversOf(planId)).toEqual([null]);
  });
});
