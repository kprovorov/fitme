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
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyPlanUpdate,
  type PlanUpdate,
  previewPlanUpdate,
} from "../src/plan-update";
import { deleteTestUsers } from "./delete-test-users";

/**
 * The Plan Update service against the `workout_session_plan_changes` RPC it
 * ports, on a local Supabase stack via the Supavisor pooler as the fitme
 * login. Each case seeds the same Workout Session twice (an apply changes the
 * rows), runs one copy through the RPC and the other through the service, in
 * both modes, and requires the same answers (slugs compared, the RPC's names
 * ignored) and the same rows afterwards. The cases are the RPC's pgTAP
 * fixtures. Made-up Clerk-style User ids, unique per run.
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

/** What the RPC answers: each Exercise as `{ slug, name }`. */
interface RpcAnswer {
  changes: {
    exercise: { name: string; slug: string };
    kind: string;
    replaced_exercise?: { name: string; slug: string };
    sets?: { reps: number; weight: number }[];
  }[];
  plan: { id: string; name: string | null } | null;
  workout: { id: string; name: string } | null;
}

const viaRpc = (sessionId: string, apply: boolean, userId = owner) =>
  asUser(userId, async (tx) => {
    const {
      rows: [row],
    } = await tx.execute<{ result: RpcAnswer }>(
      sql`select public.workout_session_plan_changes(${sessionId}::uuid, ${apply}) as result`
    );
    return row.result;
  });

const viaService = (sessionId: string, apply: boolean, userId = owner) =>
  asUser(userId, (tx) =>
    (apply ? applyPlanUpdate : previewPlanUpdate)(tx, userId, sessionId)
  );

type Ref = { id: string; name: string | null } | null;

interface Refs {
  plan: Ref;
  workout: Ref;
}

/** The copy's own Plan and Workout ids as placeholders, to compare across copies. */
const withPlaceholders = ({ plan, workout }: Refs, seeded: Seeded) => ({
  plan: plan && {
    id: plan.id === seeded.planId ? "<plan>" : plan.id,
    name: plan.name,
  },
  workout: workout && {
    id: workout.id === seeded.workoutId ? "<workout>" : workout.id,
    name: workout.name,
  },
});

/** The RPC's answer as the service's: Exercises as slugs, weights as numbers. */
const fromRpc = (answer: RpcAnswer, seeded: Seeded) => ({
  changes: answer.changes.map((change) => ({
    exercise_slug: change.exercise.slug,
    kind: change.kind,
    ...(change.replaced_exercise && {
      replaced_exercise_slug: change.replaced_exercise.slug,
    }),
    ...(change.sets && {
      sets: change.sets.map(({ reps, weight }) => ({
        reps,
        weight: Number(weight),
      })),
    }),
  })),
  ...withPlaceholders(answer, seeded),
});

const fromService = (
  { weight_unit: _, ...answer }: PlanUpdate,
  seeded: Seeded
) => ({ ...answer, ...withPlaceholders(answer, seeded) });

/** A copy's Workout rows and whether its Workout Session is stamped. */
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
      // Ids differ between the copies, so a repeated order sorts by slug
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
 * Runs `fixture` through both, preview, apply, then preview and apply again:
 * each step's answer and the rows after it, per side (equal when the two
 * agree), and the service's answers.
 */
const runBoth = async (fixture: Fixture) => {
  const rpcCopy = await seed(fixture);
  const serviceCopy = await seed(fixture);
  const rpc: unknown[] = [];
  const service: unknown[] = [];
  const answers: (PlanUpdate | null)[] = [];
  for (const apply of [false, true, false, true]) {
    // biome-ignore lint/performance/noAwaitInLoops: each step reads the last one's writes
    const rpcAnswer = await viaRpc(rpcCopy.sessionId, apply, fixture.userId);
    const serviceAnswer = await viaService(
      serviceCopy.sessionId,
      apply,
      fixture.userId
    );
    rpc.push({
      answer: fromRpc(rpcAnswer, rpcCopy),
      rows: await rowsOf(rpcCopy),
    });
    service.push({
      answer: serviceAnswer && fromService(serviceAnswer, serviceCopy),
      rows: await rowsOf(serviceCopy),
    });
    answers.push(serviceAnswer);
  }
  return { answers: answers as PlanUpdate[], rpc, service };
};

const logged = (reps: number, weight?: number): SessionSet => ({
  reps,
  weight,
});

/** Every change kind, as the RPC's pgTAP suite's main Workout Session. */
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

describe("Plan Update: parity with workout_session_plan_changes", () => {
  it("offers and applies every change kind", async () => {
    const { answers, rpc, service } = await runBoth(main);
    expect(service).toEqual(rpc);
    const [preview, applied, after, again] = answers;
    expect(preview.changes.map((change) => change.kind)).toEqual([
      "replace_exercise",
      "add_sets",
      "remove_exercise",
      "add_sets",
      "add_exercise",
    ]);
    expect(applied).toEqual(preview);
    expect(after.changes).toEqual([]);
    expect(again.changes).toEqual([]);
    expect(preview.weight_unit).toBe("lbs");
  });

  it("caps each Workout Exercise at 20 sets", async () => {
    const { answers, rpc, service } = await runBoth({
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
    expect(service).toEqual(rpc);
    expect(answers[0].changes.map((change) => change.kind)).toEqual([
      "add_sets",
      "replace_exercise",
      "add_exercise",
    ]);
  });

  it("offers a replacement for the last Exercise deleted and another added", async () => {
    const { rpc, service } = await runBoth({
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
    expect(service).toEqual(rpc);
  });

  it("offers nothing never logged or logged off target", async () => {
    const { answers, rpc, service } = await runBoth({
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
    expect(service).toEqual(rpc);
    expect(answers[0].changes).toEqual([]);
  });

  it("offers the sets added after switching back to the original Exercise", async () => {
    const { rpc, service } = await runBoth({
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
    expect(service).toEqual(rpc);
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
    async (_, fixture) => {
      const { answers, rpc, service } = await runBoth(fixture);
      expect(service).toEqual(rpc);
      for (const answer of answers) {
        expect(answer.changes).toEqual([]);
      }
    }
  );

  it("offers a Plan Update exactly at the caps", async () => {
    const { answers, rpc, service } = await runBoth({
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
    expect(service).toEqual(rpc);
    expect(answers[0].changes).toHaveLength(50);
  });

  it("answers kg for a User without a Profile", async () => {
    const { answers, rpc, service } = await runBoth({
      ...main,
      userId: unprofiled,
    });
    expect(service).toEqual(rpc);
    const [preview] = answers;
    expect(preview.changes).not.toEqual([]);
    expect(preview.weight_unit).toBe("kg");
  });

  it("finds no other User's Workout Session, and changes nothing", async () => {
    const rpcCopy = await seed(main);
    const serviceCopy = await seed(main);
    const before = await rowsOf(serviceCopy);
    for (const apply of [false, true]) {
      // biome-ignore lint/performance/noAwaitInLoops: one call at a time
      await expect(
        viaRpc(rpcCopy.sessionId, apply, intruder)
      ).rejects.toThrow();
      expect(await viaService(serviceCopy.sessionId, apply, intruder)).toBe(
        null
      );
    }
    expect(await rowsOf(serviceCopy)).toEqual(before);
    expect(await rowsOf(rpcCopy)).toEqual(before);
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
