import { randomBytes } from "node:crypto";

import {
  personalRecords,
  withService,
  workoutSessionExercises,
  workoutSessions,
  asUser,
} from "@fitme/db";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan } from "@fitme/services/plans";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  EmptySlugMapError,
  readReplacedSlugs,
  rewriteExerciseSlugs,
} from "../src/rewrite-exercise-slugs.js";
import { TEST_EXERCISE_BUNDLE } from "../src/test/exercise-library.js";

/**
 * The slug rewrite against the local stack's pooler, over a test bundle's
 * map. Other test files write on the same stack at once, so every run is
 * scoped to this file's Users (`userIds`).
 */

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const alice = testUserId("rewritea");
const bob = testUserId("rewriteb");

/** Only new slugs: the rewrite never touches them. */
const carol = testUserId("rewritec");
const users = [alice, bob, carol];

// bench-press and flat-bench both become barbell-bench-press; squat becomes
// goblet-squat; plank is already new
const BUNDLE = {
  ...TEST_EXERCISE_BUNDLE,
  replaced_slugs: {
    "bench-press": "barbell-bench-press",
    "flat-bench": "barbell-bench-press",
    squat: "goblet-squat",
  },
};

const map = readReplacedSlugs(BUNDLE);
const silent = () => {};

const set = {
  reps_recommended: 8,
  rest_recommended: 90,
  weight_recommended: 60,
};

/** An inactive Plan of one Workout with these Exercises. */
const seedPlan = async (userId: string, slugs: string[]) => {
  const plan = await asUser(userId, (tx) =>
    createPlan(
      tx,
      userId,
      {
        description: "Rewrite",
        frequency: 3,
        name: "Rewrite",
        workouts: [
          {
            description: "A",
            exercises: slugs.map((slug) => ({
              exercise_slug: slug,
              sets: [set],
            })),
            name: "A",
          },
        ],
      },
      { activate: false }
    )
  );

  return plan.id;
};

interface SeedRecord {
  reps: number;
  slug: string;
  weight: number;
}

/** A Workout Session with these Exercises, finished unless `open`, and these Personal records. */
const seedSession = (
  userId: string,
  slugs: string[],
  {
    open = false,
    records = [],
  }: { open?: boolean; records?: SeedRecord[] } = {}
) =>
  withService(async (tx) => {
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        finishedAt: open ? null : new Date().toISOString(),
        startedAt: new Date(Date.now() - 3_600_000).toISOString(),
        userId,
      })
      .returning({ id: workoutSessions.id });

    const id = session?.id ?? "";

    if (slugs.length > 0) {
      await tx.insert(workoutSessionExercises).values(
        slugs.map((slug, index) => ({
          exerciseSlug: slug,
          order: index + 1,
          workoutSessionId: id,
        }))
      );
    }

    if (records.length > 0) {
      await tx.insert(personalRecords).values(
        records.map((record) => ({
          exerciseSlug: record.slug,
          kind: "weight",
          reps: record.reps,
          userId,
          weight: String(record.weight),
          workoutSessionId: id,
        }))
      );
    }

    return id;
  });

/** Every stored slug of the Users, per table, sorted. */
const snapshot = () =>
  withService(async (tx) => {
    const planSlugs = await tx.query.plans.findMany({
      columns: { userId: true },
      orderBy: (p) => [asc(p.userId)],
      where: (p) => inArray(p.userId, users),
      with: {
        workouts: {
          columns: {},
          with: {
            workoutExercises: {
              columns: { exerciseSlug: true },
              orderBy: (we) => [asc(we.order)],
            },
          },
        },
      },
    });

    const sessions = await tx.query.workoutSessions.findMany({
      columns: { finishedAt: true, id: true, userId: true },
      where: (s) => inArray(s.userId, users),
      with: {
        workoutSessionExercises: {
          columns: { exerciseSlug: true },
          orderBy: (wse) => [asc(wse.order)],
        },
      },
    });

    const records = await tx
      .select({
        reps: personalRecords.reps,
        sessionId: personalRecords.workoutSessionId,
        slug: personalRecords.exerciseSlug,
        weight: personalRecords.weight,
      })
      .from(personalRecords)
      .where(inArray(personalRecords.userId, users))
      .orderBy(
        asc(personalRecords.workoutSessionId),
        asc(personalRecords.exerciseSlug)
      );

    return { planSlugs, records, sessions };
  });

const sessionSlugs = async (sessionId: string) => {
  const rows = await withService((tx) =>
    tx
      .select({ slug: workoutSessionExercises.exerciseSlug })
      .from(workoutSessionExercises)
      .where(eq(workoutSessionExercises.workoutSessionId, sessionId))
      .orderBy(asc(workoutSessionExercises.order))
  );

  return rows.map((row) => row.slug);
};

const recordsOf = (sessionId: string) =>
  withService((tx) =>
    tx
      .select({
        reps: personalRecords.reps,
        slug: personalRecords.exerciseSlug,
        weight: personalRecords.weight,
      })
      .from(personalRecords)
      .where(eq(personalRecords.workoutSessionId, sessionId))
      .orderBy(asc(personalRecords.exerciseSlug))
  );

const planSlugs = async (planId: string) => {
  const planWorkouts = await withService((tx) =>
    tx.query.workouts.findMany({
      columns: {},
      where: (w, { eq: is }) => is(w.planId, planId),
      with: {
        workoutExercises: {
          columns: { exerciseSlug: true },
          orderBy: (we) => [asc(we.order)],
        },
      },
    })
  );

  return planWorkouts.flatMap((w) =>
    w.workoutExercises.map((we) => we.exerciseSlug)
  );
};

const seeded = {
  aliceCollision: "",
  aliceOpen: "",
  alicePlan: "",
  aliceTie: "",
  bobFinished: "",
  bobPlan: "",
  carolPlan: "",
  carolSession: "",
};

/** What the seeded rows hold now. */
const stored = async () => ({
  plans: {
    alice: await planSlugs(seeded.alicePlan),
    bob: await planSlugs(seeded.bobPlan),
    carol: await planSlugs(seeded.carolPlan),
  },
  records: {
    aliceCollision: await recordsOf(seeded.aliceCollision),
    aliceTie: await recordsOf(seeded.aliceTie),
    bobFinished: await recordsOf(seeded.bobFinished),
    carolSession: await recordsOf(seeded.carolSession),
  },
  sessions: {
    aliceCollision: await sessionSlugs(seeded.aliceCollision),
    aliceOpen: await sessionSlugs(seeded.aliceOpen),
    bobFinished: await sessionSlugs(seeded.bobFinished),
  },
});

const byUser = <T extends { userId: string }>(rows: T[]) =>
  rows.toSorted((a, b) => a.userId.localeCompare(b.userId));

describe("Exercise slug rewrite", () => {
  beforeAll(async () => {
    seeded.alicePlan = await seedPlan(alice, [
      "bench-press",
      "plank",
      "flat-bench",
    ]);
    // Both old bench slugs land on barbell-bench-press: the heavier record stays
    seeded.aliceCollision = await seedSession(
      alice,
      ["bench-press", "flat-bench", "squat"],
      {
        records: [
          { reps: 5, slug: "bench-press", weight: 100 },
          { reps: 8, slug: "flat-bench", weight: 90 },
          { reps: 10, slug: "squat", weight: 40 },
        ],
      }
    );
    // An old slug landing on a record already new: same weight, more reps wins
    seeded.aliceTie = await seedSession(
      alice,
      ["bench-press", "barbell-bench-press"],
      {
        records: [
          { reps: 6, slug: "barbell-bench-press", weight: 80 },
          { reps: 9, slug: "bench-press", weight: 80 },
        ],
      }
    );
    seeded.aliceOpen = await seedSession(alice, ["squat", "plank"], {
      open: true,
    });

    seeded.bobPlan = await seedPlan(bob, ["squat", "goblet-squat"]);
    seeded.bobFinished = await seedSession(bob, ["squat"], {
      records: [{ reps: 12, slug: "squat", weight: 20 }],
    });

    seeded.carolPlan = await seedPlan(carol, ["plank", "goblet-squat"]);
    seeded.carolSession = await seedSession(carol, ["plank"], {
      records: [{ reps: 30, slug: "plank", weight: 0 }],
    });
  });

  afterAll(() => deleteTestUsers(users));

  it("refuses an empty map before anything is read", async () => {
    const before = await snapshot();

    await expect(
      rewriteExerciseSlugs({ log: silent, map: {}, userIds: users })
    ).rejects.toBeInstanceOf(EmptySlugMapError);
    expect(
      readReplacedSlugs({ ...TEST_EXERCISE_BUNDLE, replaced_slugs: undefined })
    ).toStrictEqual({});
    await expect(snapshot()).resolves.toStrictEqual(before);
  });

  it("counts per User on a dry run, writes nothing and logs ids and counts only", async () => {
    const before = await snapshot();
    const lines: string[] = [];

    const report = await rewriteExerciseSlugs({
      dryRun: true,
      log: (line) => lines.push(line),
      map,
      userIds: users,
    });

    expect({ ...report, users: byUser(report.users) }).toStrictEqual({
      users: byUser([
        {
          personalRecords: 3,
          personalRecordsDropped: 2,
          userId: alice,
          workoutExercises: 2,
          workoutSessionExercises: 5,
        },
        {
          personalRecords: 1,
          personalRecordsDropped: 0,
          userId: bob,
          workoutExercises: 1,
          workoutSessionExercises: 1,
        },
      ]),
      written: 0,
    });
    await expect(snapshot()).resolves.toStrictEqual(before);

    const output = lines.join("\n");
    expect(output).toContain(alice);
    expect(
      [carol, "bench", "squat", "plank", "Rewrite"].filter((detail) =>
        output.includes(detail)
      )
    ).toStrictEqual([]);
  });

  it("rewrites the three tables, keeping the better colliding record", async () => {
    const report = await rewriteExerciseSlugs({
      log: silent,
      map,
      userIds: users,
    });

    expect(report.written).toBe(15);
    await expect(stored()).resolves.toStrictEqual({
      plans: {
        alice: ["barbell-bench-press", "plank", "barbell-bench-press"],
        bob: ["goblet-squat", "goblet-squat"],
        // Carol's rows were all new already
        carol: ["plank", "goblet-squat"],
      },
      records: {
        aliceCollision: [
          { reps: 5, slug: "barbell-bench-press", weight: "100.00" },
          { reps: 10, slug: "goblet-squat", weight: "40.00" },
        ],
        aliceTie: [{ reps: 9, slug: "barbell-bench-press", weight: "80.00" }],
        bobFinished: [{ reps: 12, slug: "goblet-squat", weight: "20.00" }],
        carolSession: [{ reps: 30, slug: "plank", weight: "0.00" }],
      },
      sessions: {
        // Duplicate Workout Session Exercises stay
        aliceCollision: [
          "barbell-bench-press",
          "barbell-bench-press",
          "goblet-squat",
        ],
        // The open Workout Session too
        aliceOpen: ["goblet-squat", "plank"],
        bobFinished: ["goblet-squat"],
      },
    });
  });

  it("writes nothing on a re-run", async () => {
    const before = await snapshot();

    const report = await rewriteExerciseSlugs({
      log: silent,
      map,
      userIds: users,
    });

    expect(report).toStrictEqual({ users: [], written: 0 });
    await expect(snapshot()).resolves.toStrictEqual(before);
  });
});
