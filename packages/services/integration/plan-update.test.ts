import { randomUUID } from "node:crypto";
import {
  asUser,
  plans,
  profiles,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyPlanUpdate,
  type PlanUpdate,
  previewPlanUpdate,
} from "../src/plan-update";
import { deleteTestUsers } from "./delete-test-users";

/**
 * The Plan Update service on a local Supabase stack via the Supavisor pooler
 * as the fitme login. Each case seeds a Workout Session, runs it through
 * preview, apply, then preview and apply again, and checks each answer and
 * the Workout's rows after it. The cases and expected values are those of the
 * dropped `workout_session_plan_changes` RPC's pgTAP suite, which the service
 * ported (FIT-339). Made-up Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
/** Has a Profile in us units, so weights are in lbs. */
const owner = `user_svcPlanUpdateOwner${runId}`;
/** Has no Profile. */
const unprofiled = `user_svcPlanUpdateNoProfile${runId}`;
const intruder = `user_svcPlanUpdateIntruder${runId}`;

interface PlanSet {
  reps: number;
  rest: number;
  weight: number;
}

interface SessionSet {
  /** `reps_recommended`: a number when copied from the Plan (0 once replaced), absent when added. */
  recommended?: number;
  reps?: number;
  weight?: number;
}

interface Fixture {
  applied?: boolean;
  finished?: boolean;
  planDeleted?: boolean;
  /** Workout Exercises; `order` defaults to the position from 1. */
  planExercises: { order?: number; sets: PlanSet[]; slug: string }[];
  /** Workout Session Exercises; `order` defaults to the position from 1. */
  sessionExercises: { order?: number; sets: SessionSet[]; slug: string }[];
  userId?: string;
  /** The Workout Session's Workout was deleted. */
  workoutGone?: boolean;
}

interface Seeded {
  planId: string;
  sessionId: string;
  workoutId: string;
}

const times = <T>(n: number, make: (i: number) => T) =>
  Array.from({ length: n }, (_, i) => make(i + 1));

const seed = (fixture: Fixture): Promise<Seeded> =>
  withService(async (tx) => {
    const userId = fixture.userId ?? owner;
    const [plan] = await tx
      .insert(plans)
      .values({
        deletedAt: fixture.planDeleted ? "2026-10-01T00:00:00Z" : null,
        frequency: 3,
        goal: "strength",
        name: "PPL",
        place: "gym",
        userId,
      })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({ description: "", name: "Push Day", order: 1, planId: plan.id })
      .returning({ id: workouts.id });

    for (const [index, exercise] of fixture.planExercises.entries()) {
      // biome-ignore lint/performance/noAwaitInLoops: one statement at a time on tx
      const [row] = await tx
        .insert(workoutExercises)
        .values({
          exerciseSlug: exercise.slug,
          order: exercise.order ?? index + 1,
          workoutId: workout.id,
        })
        .returning({ id: workoutExercises.id });
      if (exercise.sets.length > 0) {
        await tx.insert(workoutExerciseSets).values(
          exercise.sets.map((set, setIndex) => ({
            order: setIndex + 1,
            repsRecommended: set.reps,
            restRecommended: set.rest,
            weightRecommended: String(set.weight),
            workoutExerciseId: row.id,
          }))
        );
      }
    }

    const [session] = await tx
      .insert(workoutSessions)
      .values({
        finishedAt: (fixture.finished ?? true) ? "2026-10-20T11:00:00Z" : null,
        planChangesAppliedAt: fixture.applied ? "2026-10-20T11:01:00Z" : null,
        planId: plan.id,
        startedAt: "2026-10-20T10:00:00Z",
        userId,
        workoutId: fixture.workoutGone ? null : workout.id,
      })
      .returning({ id: workoutSessions.id });

    for (const [index, exercise] of fixture.sessionExercises.entries()) {
      // biome-ignore lint/performance/noAwaitInLoops: one statement at a time on tx
      const [row] = await tx
        .insert(workoutSessionExercises)
        .values({
          exerciseSlug: exercise.slug,
          order: exercise.order ?? index + 1,
          workoutSessionId: session.id,
        })
        .returning({ id: workoutSessionExercises.id });
      if (exercise.sets.length > 0) {
        await tx.insert(workoutSessionExerciseSets).values(
          exercise.sets.map((set, setIndex) => ({
            order: setIndex + 1,
            repsCompleted: set.reps ?? null,
            repsRecommended: set.recommended ?? null,
            weightCompleted:
              set.weight === undefined ? null : String(set.weight),
            workoutSessionExerciseId: row.id,
          }))
        );
      }
    }

    return { planId: plan.id, sessionId: session.id, workoutId: workout.id };
  });

const viaService = (sessionId: string, apply: boolean, userId = owner) =>
  asUser(userId, (tx) =>
    (apply ? applyPlanUpdate : previewPlanUpdate)(tx, userId, sessionId)
  );

/** A seeded Workout's Workout Exercise ids, by `order`. */
const exerciseIdsOf = (seeded: Seeded) =>
  withService(async (tx) => {
    const rows = await tx
      .select({ id: workoutExercises.id, order: workoutExercises.order })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, seeded.workoutId));
    return new Map(rows.map(({ id, order }) => [order, id]));
  });

/** A seeded Workout's rows and whether its Workout Session is stamped. */
const rowsOf = (seeded: Seeded) =>
  withService(async (tx) => {
    const exercises = await tx
      .select({
        id: workoutExercises.id,
        order: workoutExercises.order,
        slug: workoutExercises.exerciseSlug,
      })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, seeded.workoutId))
      // A repeated order sorts by slug
      .orderBy(asc(workoutExercises.order), asc(workoutExercises.exerciseSlug));
    const sets =
      exercises.length === 0
        ? []
        : await tx
            .select({
              exerciseId: workoutExerciseSets.workoutExerciseId,
              order: workoutExerciseSets.order,
              reps: workoutExerciseSets.repsRecommended,
              rest: workoutExerciseSets.restRecommended,
              weight: workoutExerciseSets.weightRecommended,
            })
            .from(workoutExerciseSets)
            .where(
              inArray(
                workoutExerciseSets.workoutExerciseId,
                exercises.map((exercise) => exercise.id)
              )
            )
            .orderBy(asc(workoutExerciseSets.order));
    const [session] = await tx
      .select({ appliedAt: workoutSessions.planChangesAppliedAt })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, seeded.sessionId));
    return {
      applied: session.appliedAt !== null,
      exercises: exercises.map((exercise) => ({
        order: exercise.order,
        sets: sets
          .filter((set) => set.exerciseId === exercise.id)
          .map(({ exerciseId: _, weight, ...set }) => ({
            ...set,
            weight: Number(weight),
          })),
        slug: exercise.slug,
      })),
    };
  });

/**
 * Runs `fixture` through preview, apply, preview and apply: each step's
 * answer, the rows before the first and the rows after each, and the
 * Workout Exercise ids before.
 */
const run = async (fixture: Fixture) => {
  const seeded = await seed(fixture);
  const before = await rowsOf(seeded);
  const idsBefore = await exerciseIdsOf(seeded);
  const answers: (PlanUpdate | null)[] = [];
  const rows: Awaited<ReturnType<typeof rowsOf>>[] = [];
  for (const apply of [false, true, false, true]) {
    // biome-ignore lint/performance/noAwaitInLoops: each step reads the last one's writes
    answers.push(await viaService(seeded.sessionId, apply, fixture.userId));
    rows.push(await rowsOf(seeded));
  }
  return { answers: answers as PlanUpdate[], before, idsBefore, rows, seeded };
};

/** A Plan set's row as `rowsOf` reads it. */
const planSet = (
  order: number,
  reps: number,
  weight: number,
  rest: number
) => ({
  order,
  reps,
  rest,
  weight,
});

const logged = (reps: number, weight?: number): SessionSet => ({
  reps,
  weight,
});

/** Every change kind. */
const main: Fixture = {
  planExercises: [
    {
      sets: [
        { reps: 8, rest: 120, weight: 60 },
        { reps: 8, rest: 120, weight: 60 },
        { reps: 8, rest: 150, weight: 60 },
      ],
      slug: "test-bench-press",
    },
    {
      sets: [
        { reps: 5, rest: 180, weight: 100 },
        { reps: 5, rest: 200, weight: 100 },
      ],
      slug: "test-squat",
    },
    { sets: [{ reps: 12, rest: 90, weight: 0 }], slug: "test-dips" },
    { sets: [{ reps: 10, rest: 60, weight: 40 }], slug: "test-bench-press" },
  ],
  sessionExercises: [
    // Slot 1 replaced: 3 copied sets (2 logged), 1 added unlogged
    {
      order: 1,
      sets: [
        { recommended: 0, reps: 8, weight: 30 },
        { recommended: 0, reps: 6, weight: 32.5 },
        { recommended: 0 },
        {},
      ],
      slug: "test-dumbbell-press",
    },
    // Slot 2: copied sets logged off target and unlogged, 3 added (one
    // logged without a weight, one unlogged)
    {
      order: 2,
      sets: [
        { recommended: 5, reps: 6, weight: 105 },
        { recommended: 5 },
        logged(5, 100),
        logged(3),
        {},
      ],
      slug: "test-squat",
    },
    // Slot 3 (Dips) removed; slot 4 with an added set
    {
      order: 4,
      sets: [{ recommended: 10, reps: 10, weight: 40 }, logged(10, 45)],
      slug: "test-bench-press",
    },
    // Slot 5 added, 2 of 3 logged; slot 6 added, never logged
    {
      order: 5,
      sets: [logged(12, 15), {}, logged(12, 17.5)],
      slug: "test-cable-fly",
    },
    { order: 6, sets: [{}], slug: "test-leg-press" },
  ],
};

/** What `main` offers. */
const mainChanges: PlanUpdate["changes"] = [
  {
    exercise_slug: "test-dumbbell-press",
    kind: "replace_exercise",
    replaced_exercise_slug: "test-bench-press",
    sets: [
      { reps: 8, weight: 30 },
      { reps: 6, weight: 32.5 },
      { reps: 6, weight: 32.5 },
      { reps: 6, weight: 32.5 },
    ],
  },
  {
    exercise_slug: "test-squat",
    kind: "add_sets",
    sets: [
      { reps: 5, weight: 100 },
      { reps: 3, weight: 0 },
    ],
  },
  { exercise_slug: "test-dips", kind: "remove_exercise" },
  {
    exercise_slug: "test-bench-press",
    kind: "add_sets",
    sets: [{ reps: 10, weight: 45 }],
  },
  {
    exercise_slug: "test-cable-fly",
    kind: "add_exercise",
    sets: [
      { reps: 12, weight: 15 },
      { reps: 12, weight: 17.5 },
    ],
  },
];

/** `main`'s Workout once applied. */
const mainAppliedRows = {
  applied: true,
  exercises: [
    {
      order: 1,
      sets: [
        planSet(1, 8, 30, 120),
        planSet(2, 6, 32.5, 120),
        planSet(3, 6, 32.5, 150),
        planSet(4, 6, 32.5, 150),
      ],
      slug: "test-dumbbell-press",
    },
    {
      order: 2,
      sets: [
        planSet(1, 5, 100, 180),
        planSet(2, 5, 100, 200),
        planSet(3, 5, 100, 200),
        planSet(4, 3, 0, 200),
      ],
      slug: "test-squat",
    },
    {
      order: 3,
      sets: [planSet(1, 10, 40, 60), planSet(2, 10, 45, 60)],
      slug: "test-bench-press",
    },
    {
      order: 4,
      sets: [planSet(1, 12, 15, 90), planSet(2, 12, 17.5, 90)],
      slug: "test-cable-fly",
    },
  ],
};

beforeAll(async () => {
  await withService((tx) =>
    tx.insert(profiles).values({
      age: 30,
      gender: "male",
      height: "70",
      measurementSystem: "us",
      userId: owner,
      weight: "180",
    })
  );
});

afterAll(async () => {
  await deleteTestUsers([owner, unprofiled, intruder]);
});

describe("Plan Update: previewing and applying", () => {
  it("offers and applies every change kind", async () => {
    const { answers, before, idsBefore, rows, seeded } = await run(main);
    const [preview, applied, after, again] = answers;
    expect(preview).toEqual({
      changes: mainChanges,
      plan: { id: seeded.planId, name: "PPL" },
      weight_unit: "lbs",
      workout: { id: seeded.workoutId, name: "Push Day" },
    });
    expect(rows[0]).toEqual(before);

    expect(applied).toEqual(preview);
    expect(rows[1]).toEqual(mainAppliedRows);
    // The replacement keeps its Workout Exercise row
    expect((await exerciseIdsOf(seeded)).get(1)).toBe(idsBefore.get(1));

    expect(after).toEqual({ ...preview, changes: [] });
    expect(again).toEqual({ ...preview, changes: [] });
    expect(rows[2]).toEqual(mainAppliedRows);
    expect(rows[3]).toEqual(mainAppliedRows);
  });

  it("caps each Workout Exercise at 20 sets", async () => {
    const { answers, rows } = await run({
      planExercises: [
        {
          sets: times(19, () => ({ reps: 5, rest: 180, weight: 100 })),
          slug: "test-squat",
        },
        {
          sets: [{ reps: 8, rest: 120, weight: 60 }],
          slug: "test-bench-press",
        },
      ],
      sessionExercises: [
        {
          sets: [
            ...times(19, () => ({ recommended: 5, reps: 5, weight: 100 })),
            ...times(3, (n) => logged(4 + n, 100)),
          ],
          slug: "test-squat",
        },
        {
          sets: times(22, (n) => ({
            recommended: n === 1 ? 0 : undefined,
            reps: n,
            weight: 20,
          })),
          slug: "test-dumbbell-press",
        },
        { sets: times(21, (n) => logged(n, 10)), slug: "test-cable-fly" },
      ],
    });
    expect(
      answers[0].changes.map((change) => ({
        kind: change.kind,
        sets: "sets" in change ? change.sets.length : 0,
      }))
    ).toEqual([
      { kind: "add_sets", sets: 1 },
      { kind: "replace_exercise", sets: 20 },
      { kind: "add_exercise", sets: 20 },
    ]);
    expect(answers[0].changes[0]).toMatchObject({
      sets: [{ reps: 5, weight: 100 }],
    });
    expect(rows[1].exercises.map((exercise) => exercise.sets.length)).toEqual([
      20, 20, 20,
    ]);
  });

  it("offers a replacement for the last Exercise deleted and another added", async () => {
    const { answers, idsBefore, rows, seeded } = await run({
      planExercises: [
        { sets: [{ reps: 5, rest: 180, weight: 100 }], slug: "test-squat" },
        {
          sets: [
            { reps: 12, rest: 75, weight: 0 },
            { reps: 12, rest: 75, weight: 0 },
          ],
          slug: "test-dips",
        },
      ],
      sessionExercises: [
        {
          sets: [{ recommended: 5, reps: 5, weight: 100 }],
          slug: "test-squat",
        },
        { sets: [logged(15, 20)], slug: "test-cable-fly" },
      ],
    });
    expect(answers[0].changes).toEqual([
      {
        exercise_slug: "test-cable-fly",
        kind: "replace_exercise",
        replaced_exercise_slug: "test-dips",
        sets: [{ reps: 15, weight: 20 }],
      },
    ]);
    expect(rows[1].exercises).toEqual([
      { order: 1, sets: [planSet(1, 5, 100, 180)], slug: "test-squat" },
      { order: 2, sets: [planSet(1, 15, 20, 75)], slug: "test-cable-fly" },
    ]);
    // The slot keeps its Workout Exercise row
    expect((await exerciseIdsOf(seeded)).get(2)).toBe(idsBefore.get(2));
  });

  it("offers nothing never logged or logged off target", async () => {
    const { answers, before, rows } = await run({
      planExercises: [
        {
          sets: [{ reps: 8, rest: 120, weight: 60 }],
          slug: "test-bench-press",
        },
        { sets: [{ reps: 5, rest: 180, weight: 100 }], slug: "test-squat" },
      ],
      sessionExercises: [
        { sets: [{ recommended: 0 }], slug: "test-dumbbell-press" },
        {
          sets: [{ recommended: 5, reps: 3, weight: 90 }, {}],
          slug: "test-squat",
        },
        { sets: [{}], slug: "test-cable-fly" },
      ],
    });
    for (const answer of answers) {
      expect(answer.changes).toEqual([]);
    }
    for (const after of rows) {
      expect(after.exercises).toEqual(before.exercises);
    }
  });

  it("offers the sets added after switching back to the original Exercise", async () => {
    const { answers, rows } = await run({
      planExercises: [
        { sets: [{ reps: 5, rest: 180, weight: 100 }], slug: "test-squat" },
      ],
      sessionExercises: [
        {
          sets: [
            { recommended: 0, reps: 5, weight: 100 },
            { recommended: 0, reps: 4, weight: 100 },
            { recommended: 0 },
          ],
          slug: "test-squat",
        },
      ],
    });
    expect(answers[0].changes).toEqual([
      {
        exercise_slug: "test-squat",
        kind: "add_sets",
        sets: [{ reps: 4, weight: 100 }],
      },
    ]);
    expect(rows[1].exercises).toEqual([
      {
        order: 1,
        sets: [planSet(1, 5, 100, 180), planSet(2, 4, 100, 180)],
        slug: "test-squat",
      },
    ]);
  });

  it.each([
    ["an open Workout Session", { ...main, finished: false }],
    ["an already applied one", { ...main, applied: true }],
    ["a soft-deleted Plan", { ...main, planDeleted: true }],
    ["no Workout", { ...main, workoutGone: true }],
    [
      "a repeated order in the Workout",
      {
        planExercises: [
          { sets: [], slug: "test-bench-press" },
          { order: 1, sets: [], slug: "test-squat" },
        ],
        sessionExercises: [
          {
            sets: [{ recommended: 0, reps: 8, weight: 30 }],
            slug: "test-dumbbell-press",
          },
        ],
      },
    ],
    [
      "a repeated order in the Workout Session",
      {
        ...main,
        sessionExercises: [
          ...main.sessionExercises,
          { order: 1, sets: [logged(8, 30)], slug: "test-cable-fly" },
        ],
      },
    ],
    [
      "more than 50 Exercises in the Workout Session",
      {
        planExercises: [],
        sessionExercises: times(51, () => ({
          sets: [logged(12, 15)],
          slug: "test-cable-fly",
        })),
      },
    ],
    [
      "more than 50 Exercises in the Workout",
      {
        planExercises: times(51, () => ({
          sets: [{ reps: 8, rest: 90, weight: 20 }],
          slug: "test-cable-fly",
        })),
        sessionExercises: [],
      },
    ],
    [
      "more than 100 sets on a Workout Session Exercise",
      {
        planExercises: [],
        sessionExercises: [
          { sets: times(101, () => logged(12, 15)), slug: "test-cable-fly" },
        ],
      },
    ],
    [
      "more than 100 sets on a Workout Exercise",
      {
        planExercises: [
          {
            sets: times(101, () => ({ reps: 8, rest: 90, weight: 20 })),
            slug: "test-squat",
          },
        ],
        sessionExercises: [],
      },
    ],
  ] satisfies [string, Fixture][])(
    "offers and applies nothing for %s",
    async (_, fixture: Fixture) => {
      const { answers, before, rows } = await run(fixture);
      const named = !(fixture.planDeleted || fixture.workoutGone);
      for (const answer of answers) {
        expect(answer.changes).toEqual([]);
        expect(answer.plan === null).toBe(!named);
        expect(answer.workout === null).toBe(!named);
      }
      for (const after of rows) {
        expect(after).toEqual(before);
      }
    }
  );

  it("offers a Plan Update exactly at the caps", async () => {
    const { answers, rows } = await run({
      planExercises: [
        {
          sets: times(100, () => ({ reps: 8, rest: 90, weight: 20 })),
          slug: "test-squat",
        },
      ],
      sessionExercises: [
        ...times(49, () => ({
          sets: [logged(12, 15)],
          slug: "test-cable-fly",
        })),
        { sets: times(100, () => logged(12, 15)), slug: "test-leg-press" },
      ],
    });
    expect(answers[0].changes.map((change) => change.kind)).toEqual([
      "replace_exercise",
      ...times(49, () => "add_exercise"),
    ]);
    expect(answers[0].changes.at(-1)).toMatchObject({
      exercise_slug: "test-leg-press",
      sets: times(20, () => ({ reps: 12, weight: 15 })),
    });
    expect(rows[1].exercises).toHaveLength(50);
  });

  it("answers kg for a User without a Profile", async () => {
    const { answers, rows } = await run({ ...main, userId: unprofiled });
    const [preview] = answers;
    expect(preview.changes).toEqual(mainChanges);
    expect(preview.weight_unit).toBe("kg");
    expect(rows[1]).toEqual(mainAppliedRows);
  });

  it("finds no other User's Workout Session, and changes nothing", async () => {
    const seeded = await seed(main);
    const before = await rowsOf(seeded);
    for (const apply of [false, true]) {
      // biome-ignore lint/performance/noAwaitInLoops: one call at a time
      expect(await viaService(seeded.sessionId, apply, intruder)).toBe(null);
    }
    expect(await rowsOf(seeded)).toEqual(before);
  });

  it("finds no Workout Session that doesn't exist", async () => {
    expect(await viaService(randomUUID(), false)).toBe(null);
    expect(await viaService(randomUUID(), true)).toBe(null);
  });
});

describe("Plan Update: applying", () => {
  it("writes once when two applies run at once", async () => {
    const copy = await seed(main);
    const expected = await seed(main);
    await viaService(expected.sessionId, true);

    const answers = await Promise.all([
      viaService(copy.sessionId, true),
      viaService(copy.sessionId, true),
    ]);
    const changeCounts = answers.map((answer) => answer?.changes.length);
    expect([...changeCounts].sort()).toEqual([0, 5]);
    expect(await rowsOf(copy)).toEqual(await rowsOf(expected));
  });

  it("writes nothing in preview", async () => {
    const copy = await seed(main);
    const before = await rowsOf(copy);
    await viaService(copy.sessionId, false);
    expect(await rowsOf(copy)).toEqual(before);
  });
});
