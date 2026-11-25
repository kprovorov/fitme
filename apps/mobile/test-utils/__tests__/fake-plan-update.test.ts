/**
 * The fake Public API's Plan Update routes, through the real client, on the
 * cases and expected values of the services' Plan Update suite
 * (`packages/services/integration/plan-update.test.ts`): a case changed there
 * changes here. Each seeds a Workout Session, runs it through preview, apply,
 * then preview and apply again, and checks each answer and the seeded Plan.
 */
import type { components } from "@fitme/api-client";
import { beforeEach, describe, expect, it } from "@jest/globals";

import { publicApi } from "~/lib/public-api";
import { backend, FAKE_USER_ID } from "~/test-utils/fake-public-api";

type PlanUpdate = components["schemas"]["PlanUpdate"];

interface PlanSet {
  /** Defaults to the position from 1. */
  order?: number;
  reps: number;
  rest: number;
  weight: number;
}

interface SessionSet {
  /** Defaults to the position from 1. */
  order?: number;
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

const times = <T>(n: number, make: (i: number) => T) =>
  Array.from({ length: n }, (_, i) => make(i + 1));

const seed = async (fixture: Fixture) => {
  backend.seedPlan({
    deleted_at: fixture.planDeleted === true ? "2026-10-01T00:00:00Z" : null,
    id: "plan-1",
    name: "PPL",
    workouts: [
      {
        exercises: fixture.planExercises.map(({ order, sets, slug }) => ({
          order,
          sets: sets.map((set) => ({
            order: set.order,
            reps_recommended: set.reps,
            rest_recommended: set.rest,
            weight_recommended: set.weight,
          })),
          slug,
        })),
        id: "workout-1",
        name: "Push Day",
      },
    ],
  });

  backend.seed({
    exercises: [],
    finished: true,
    id: "session-1",
    userId: fixture.userId,
    workoutId: fixture.workoutGone === true ? null : "workout-1",
  });

  for (const [index, exercise] of fixture.sessionExercises.entries()) {
    const exerciseId = `session-1-e${index + 1}`;
    backend.exercises.push({
      exercise_slug: exercise.slug,
      id: exerciseId,
      order: exercise.order ?? index + 1,
      workout_session_id: "session-1",
    });

    for (const [setIndex, set] of exercise.sets.entries()) {
      backend.sets.push({
        id: `${exerciseId}-s${setIndex + 1}`,
        logged_at: null,
        order: set.order ?? setIndex + 1,
        reps_completed: set.reps ?? null,
        reps_recommended: set.recommended ?? null,
        rest_recommended: null,
        weight_completed: set.weight ?? null,
        weight_recommended: null,
        workout_session_exercise_id: exerciseId,
      });
    }
  }

  if (fixture.applied === true) {
    // Applied while the Workout Session had nothing to change
    const { exercises, sets } = backend;
    const [workout] = backend.plans[0].workouts;
    const planned = workout.exercises;
    Object.assign(backend, { exercises: [], sets: [] });
    workout.exercises = [];
    await planUpdate(true);
    Object.assign(backend, { exercises, sets });
    workout.exercises = planned;
  }

  if (fixture.finished === false) {
    const session = backend.session("session-1");
    Object.assign(session ?? {}, { finished_at: null });
  }
};

const planUpdate = async (
  apply: boolean,
  query?: { include_set_removals?: boolean },
  id = "session-1"
) => {
  const params = { path: { id }, query };

  const { data } = apply
    ? await publicApi().POST("/v1/workout-sessions/{id}/plan-update", {
        params,
      })
    : await publicApi().GET("/v1/workout-sessions/{id}/plan-update", {
        params,
      });

  if (!data) {
    throw new Error("Expected a Plan Update for the seeded Workout Session");
  }

  return data.data;
};

const optIn = { include_set_removals: true };

const plannedExercises = () =>
  backend.nestedPlan(backend.plans[0]).workouts[0].exercises;

/** The seeded Workout's Exercises and sets. */
const rowsOf = () =>
  plannedExercises().map((exercise) => ({
    order: exercise.order,
    sets: exercise.sets.map((set) => ({
      order: set.order,
      reps: set.reps_recommended,
      rest: set.rest_recommended,
      weight: set.weight_recommended,
    })),
    slug: exercise.exercise_slug,
  }));

/** Runs `fixture` through preview, apply, preview and apply. */
const run = async (
  fixture: Fixture,
  query?: { include_set_removals?: boolean }
) => {
  await seed(fixture);
  const before = rowsOf();
  const idsBefore = plannedExercises().map(({ id }) => id);

  const preview = await planUpdate(false, query);
  const rows = [rowsOf()];
  const applied = await planUpdate(true, query);
  rows.push(rowsOf());
  const after = await planUpdate(false, query);
  rows.push(rowsOf());
  const again = await planUpdate(true, query);
  rows.push(rowsOf());

  return { answers: [preview, applied, after, again], before, idsBefore, rows };
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
const mainAppliedRows = [
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
];

/** A Squat whose three sets differ, so a test sees which one went. */
const squatSets: PlanSet[] = [
  { reps: 10, rest: 60, weight: 40 },
  { reps: 8, rest: 90, weight: 50.5 },
  { reps: 6, rest: 120, weight: 60 },
];

/** A logged Workout Session set copied from the Plan set at `order`. */
const copied = (order: number, recommended = 5): SessionSet => ({
  order,
  recommended,
  reps: 5,
  weight: 45,
});

/** A logged Workout Session set added at `order`. */
const added = (order: number, reps: number): SessionSet => ({
  order,
  reps,
  weight: 70,
});

const allSquatRows = [
  planSet(1, 10, 40, 60),
  planSet(2, 8, 50.5, 90),
  planSet(3, 6, 60, 120),
];

const addSets = (...reps: number[]): PlanUpdate["changes"] => [
  {
    exercise_slug: "test-squat",
    kind: "add_sets",
    sets: reps.map((count) => ({ reps: count, weight: 70 })),
  },
];

interface SetCase {
  changes?: PlanUpdate["changes"];
  name: string;
  /** The Squat's sets once applied with the option. */
  planAfter?: ReturnType<typeof planSet>[];
  planSets?: PlanSet[];
  removed?: { reps: number; weight: number }[];
  sets: SessionSet[];
  slug?: string;
}

const squatSession = ({
  planSets = squatSets,
  sets,
  slug = "test-squat",
}: Pick<SetCase, "planSets" | "sets" | "slug">): Fixture => ({
  planExercises: [{ sets: planSets, slug: "test-squat" }],
  sessionExercises: [{ sets, slug }],
});

const removalsOf = ({ removed }: SetCase): PlanUpdate["set_removals"] =>
  removed ? [{ exercise_slug: "test-squat", sets: removed }] : [];

const twenty = times(20, () => ({ reps: 5, rest: 180, weight: 100 }));
const nineteen = twenty.slice(1);

const setCases: SetCase[] = [
  {
    name: "the first set",
    planAfter: [planSet(1, 8, 50.5, 90), planSet(2, 6, 60, 120)],
    removed: [{ reps: 10, weight: 40 }],
    sets: [copied(2), copied(3)],
  },
  {
    name: "a middle set",
    planAfter: [planSet(1, 10, 40, 60), planSet(2, 6, 60, 120)],
    removed: [{ reps: 8, weight: 50.5 }],
    sets: [copied(1), copied(3)],
  },
  {
    name: "the last set",
    planAfter: [planSet(1, 10, 40, 60), planSet(2, 8, 50.5, 90)],
    removed: [{ reps: 6, weight: 60 }],
    sets: [copied(1), copied(2)],
  },
  {
    name: "none for a skipped, unlogged set",
    planAfter: allSquatRows,
    sets: [{ order: 1, recommended: 5 }, copied(2), copied(3)],
  },
  {
    name: "none when one is removed and one added",
    planAfter: allSquatRows,
    sets: [copied(2), copied(3), added(4, 4)],
  },
  {
    name: "none when the last is removed and one added in its order",
    planAfter: allSquatRows,
    sets: [copied(1), copied(2), added(3, 4)],
  },
  {
    name: "the first removed ones when more are removed than added",
    planAfter: [planSet(1, 8, 50.5, 90), planSet(2, 6, 60, 120)],
    removed: [{ reps: 10, weight: 40 }],
    sets: [copied(2), added(4, 4)],
  },
  {
    changes: addSets(3),
    name: "the last added one when more are added than removed",
    planAfter: [...allSquatRows, planSet(4, 3, 70, 120)],
    sets: [copied(2), copied(3), added(4, 4), added(5, 3)],
  },
  {
    changes: [{ exercise_slug: "test-squat", kind: "remove_exercise" }],
    name: "the Exercise when every set is gone",
    sets: [],
  },
  {
    name: "none for an Exercise replaced and emptied",
    planAfter: allSquatRows,
    sets: [],
    slug: "test-leg-press",
  },
  {
    name: "a set removed after replacing and switching back",
    planAfter: [planSet(1, 8, 50.5, 90), planSet(2, 6, 60, 120)],
    removed: [{ reps: 10, weight: 40 }],
    sets: [copied(2, 0), copied(3, 0)],
  },
  {
    name: "none when one is removed and one added after switching back",
    planAfter: allSquatRows,
    sets: [copied(1, 0), copied(3, 0), copied(4, 0)],
  },
  {
    name: "none with a repeated set order in the Plan",
    planAfter: [
      planSet(1, 10, 40, 60),
      planSet(1, 10, 40, 60),
      planSet(3, 6, 60, 120),
    ],
    planSets: [squatSets[0], { ...squatSets[0], order: 1 }, squatSets[2]],
    sets: [copied(1), copied(1)],
  },
  {
    name: "none with a repeated set order in the Workout Session",
    planAfter: allSquatRows,
    sets: [copied(1), copied(1)],
  },
  {
    changes: addSets(4, 4),
    name: "none, and the added sets, with a repeated order among the added",
    planAfter: [
      ...allSquatRows,
      planSet(4, 4, 70, 120),
      planSet(5, 4, 70, 120),
    ],
    sets: [copied(1), copied(2), copied(3), added(4, 4), added(4, 4)],
  },
  {
    name: "an added, never logged set still counts as added",
    planAfter: allSquatRows,
    sets: [copied(1), copied(2), { order: 4 }],
  },
  {
    changes: addSets(4),
    name: "the 20 set cap, after the removed ones are evened out",
    planAfter: [
      ...nineteen.map((_, i) => planSet(i + 1, 5, 100, 180)),
      planSet(20, 4, 70, 180),
    ],
    planSets: nineteen,
    sets: [
      ...times(18, (n) => copied(n + 1)),
      added(20, 6),
      added(21, 4),
      added(22, 3),
    ],
  },
  {
    name: "none past the 20 set cap",
    planAfter: twenty.map((_, i) => planSet(i + 1, 5, 100, 180)),
    planSets: twenty,
    sets: [...times(20, (n) => copied(n)), added(21, 4)],
  },
];

describe("the fake's Plan Update", () => {
  beforeEach(() => {
    backend.reset();
    backend.seedProfile(FAKE_USER_ID, { measurement_system: "us" });
  });

  it("offers and applies every change kind", async () => {
    const { answers, before, idsBefore, rows } = await run(main);
    const [preview, applied, after, again] = answers;
    expect(preview).toStrictEqual({
      changes: mainChanges,
      plan: { id: "plan-1", name: "PPL" },
      set_removals: [],
      weight_unit: "lbs",
      workout: { cover: null, id: "workout-1", name: "Push Day" },
    });
    expect(rows).toStrictEqual([
      before,
      mainAppliedRows,
      mainAppliedRows,
      mainAppliedRows,
    ]);

    expect(applied).toStrictEqual(preview);
    // The replacement keeps its Workout Exercise row
    expect(plannedExercises()[0].id).toBe(idsBefore[0]);

    expect([after, again]).toStrictEqual([
      { ...preview, changes: [] },
      { ...preview, changes: [] },
    ]);
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
    ).toStrictEqual([
      { kind: "add_sets", sets: 1 },
      { kind: "replace_exercise", sets: 20 },
      { kind: "add_exercise", sets: 20 },
    ]);
    expect(answers[0].changes[0]).toMatchObject({
      sets: [{ reps: 5, weight: 100 }],
    });
    expect(rows[1].map((exercise) => exercise.sets.length)).toStrictEqual([
      20, 20, 20,
    ]);
  });

  it("offers a replacement for the last Exercise deleted and another added", async () => {
    const { answers, idsBefore, rows } = await run({
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

    expect(answers[0].changes).toStrictEqual([
      {
        exercise_slug: "test-cable-fly",
        kind: "replace_exercise",
        replaced_exercise_slug: "test-dips",
        sets: [{ reps: 15, weight: 20 }],
      },
    ]);
    expect(rows[1]).toStrictEqual([
      { order: 1, sets: [planSet(1, 5, 100, 180)], slug: "test-squat" },
      { order: 2, sets: [planSet(1, 15, 20, 75)], slug: "test-cable-fly" },
    ]);
    // The slot keeps its Workout Exercise row
    expect(plannedExercises()[1].id).toBe(idsBefore[1]);
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

    expect(answers.map((answer) => answer.changes)).toStrictEqual(
      answers.map(() => [])
    );
    expect(rows).toStrictEqual(rows.map(() => before));
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

    expect(answers[0].changes).toStrictEqual([
      {
        exercise_slug: "test-squat",
        kind: "add_sets",
        sets: [{ reps: 4, weight: 100 }],
      },
    ]);
    expect(rows[1]).toStrictEqual([
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
      const { answers, before, rows } = await run(fixture, optIn);

      const named =
        fixture.planDeleted !== true && fixture.workoutGone !== true;

      expect(
        answers.map((answer) => ({
          changes: answer.changes,
          setRemovals: answer.set_removals,
          planIsNull: answer.plan === null,
          workoutIsNull: answer.workout === null,
        }))
      ).toStrictEqual(
        answers.map(() => ({
          changes: [],
          setRemovals: [],
          planIsNull: !named,
          workoutIsNull: !named,
        }))
      );
      expect(rows).toStrictEqual(rows.map(() => before));
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

    expect(answers[0].changes.map((change) => change.kind)).toStrictEqual([
      "replace_exercise",
      ...times(49, () => "add_exercise"),
    ]);
    expect(answers[0].changes.at(-1)).toMatchObject({
      exercise_slug: "test-leg-press",
      sets: times(20, () => ({ reps: 12, weight: 15 })),
    });
    expect(rows[1]).toHaveLength(50);
  });

  it.each(setCases)("set removals: $name", async (setCase) => {
    const { answers, before, rows } = await run(squatSession(setCase), optIn);

    const [preview, ...others] = answers;
    expect(preview).toMatchObject({
      changes: setCase.changes ?? [],
      set_removals: removalsOf(setCase),
    });

    const nothing = { ...preview, changes: [], set_removals: [] };
    expect(others).toStrictEqual([preview, nothing, nothing]);

    const after = setCase.planAfter
      ? [{ order: 1, sets: setCase.planAfter, slug: "test-squat" }]
      : [];

    expect(rows).toStrictEqual([before, after, after, after]);
  });

  it.each(setCases)("without the option: $name", async (setCase) => {
    const { answers, before, rows } = await run(squatSession(setCase));

    expect(answers[0].changes).toStrictEqual(setCase.changes ?? []);
    expect(answers.map((answer) => answer.set_removals)).toStrictEqual(
      answers.map(() => [])
    );
    expect(rows[1].map(({ sets }) => sets)).toStrictEqual(
      setCase.removed
        ? before.map(({ sets }) => sets)
        : [setCase.planAfter].flatMap((sets) => (sets ? [sets] : []))
    );
  });

  it("removes sets from several Exercises, in Workout order, keeping their rests and the other changes", async () => {
    const { answers, rows } = await run(
      {
        planExercises: [
          { sets: squatSets, slug: "test-squat" },
          { sets: [{ reps: 12, rest: 90, weight: 0 }], slug: "test-dips" },
          { sets: squatSets, slug: "test-leg-press" },
        ],
        sessionExercises: [
          { order: 1, sets: [copied(1), copied(3)], slug: "test-squat" },
          { order: 3, sets: [copied(3)], slug: "test-leg-press" },
          { order: 4, sets: [logged(12, 15)], slug: "test-cable-fly" },
        ],
      },
      optIn
    );

    expect(answers[0].changes.map(({ kind }) => kind)).toStrictEqual([
      "remove_exercise",
      "add_exercise",
    ]);
    expect(answers[0].set_removals).toStrictEqual([
      { exercise_slug: "test-squat", sets: [{ reps: 8, weight: 50.5 }] },
      {
        exercise_slug: "test-leg-press",
        sets: [
          { reps: 10, weight: 40 },
          { reps: 8, weight: 50.5 },
        ],
      },
    ]);
    expect(rows[1]).toStrictEqual([
      {
        order: 1,
        sets: [planSet(1, 10, 40, 60), planSet(2, 6, 60, 120)],
        slug: "test-squat",
      },
      { order: 2, sets: [planSet(1, 6, 60, 120)], slug: "test-leg-press" },
      { order: 3, sets: [planSet(1, 12, 15, 90)], slug: "test-cable-fly" },
    ]);
  });

  it("answers no set removals, with the option, for a Workout that's gone", async () => {
    const { answers } = await run({ ...main, workoutGone: true }, optIn);

    expect(answers.map((answer) => answer.set_removals)).toStrictEqual(
      answers.map(() => [])
    );
  });

  it("answers kg for a User without a Profile", async () => {
    backend.reset();
    const { answers, rows } = await run(main);

    expect(answers[0].changes).toStrictEqual(mainChanges);
    expect(answers[0].weight_unit).toBe("kg");
    expect(rows[1]).toStrictEqual(mainAppliedRows);
  });

  it("keeps the ids of the sets that stay", async () => {
    await run(squatSession({ sets: [copied(1), copied(3)] }), optIn);

    expect(plannedExercises()[0].sets.map(({ id }) => id)).toStrictEqual([
      "workout-1-e1-s1",
      "workout-1-e1-s3",
    ]);
  });

  it("offers no set removal once applied without the option", async () => {
    await seed(squatSession({ sets: [copied(2), copied(3)] }));

    await planUpdate(true);

    await expect(planUpdate(false, optIn)).resolves.toMatchObject({
      changes: [],
      set_removals: [],
    });
  });

  it("removes nothing when the option is false, and refuses any other value", async () => {
    await seed(squatSession({ sets: [copied(2), copied(3)] }));

    await expect(
      planUpdate(false, { include_set_removals: false })
    ).resolves.toMatchObject({ set_removals: [] });
    await expect(
      planUpdate(false, { include_set_removals: "yes" as never })
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
  });

  it("removes sets once when two applies run at once", async () => {
    await seed(squatSession({ sets: [copied(2), copied(3)] }));

    const answers = await Promise.all([
      planUpdate(true, optIn),
      planUpdate(true, optIn),
    ]);

    expect(
      answers
        .map((answer) => answer.set_removals.length)
        .toSorted((a, b) => a - b)
    ).toStrictEqual([0, 1]);
    expect(rowsOf()[0].sets).toStrictEqual([
      planSet(1, 8, 50.5, 90),
      planSet(2, 6, 60, 120),
    ]);
  });

  it("reads a Plan seeded out of order by its orders", async () => {
    const { answers, rows } = await run(
      squatSession({
        planSets: squatSets
          .map((set, index) => ({ ...set, order: index + 1 }))
          .toReversed(),
        sets: [copied(3)],
      }),
      optIn
    );

    expect(answers[0].set_removals).toStrictEqual([
      {
        exercise_slug: "test-squat",
        sets: [
          { reps: 10, weight: 40 },
          { reps: 8, weight: 50.5 },
        ],
      },
    ]);
    expect(rows[1][0].sets).toStrictEqual([planSet(1, 6, 60, 120)]);
  });

  it("writes once when two applies run at once", async () => {
    await seed(main);

    const answers = await Promise.all([planUpdate(true), planUpdate(true)]);

    expect(
      answers.map((answer) => answer.changes.length).toSorted((a, b) => a - b)
    ).toStrictEqual([0, 5]);
    expect(rowsOf()).toStrictEqual(mainAppliedRows);
  });

  it("removes a set the User removed through the API", async () => {
    await seed({
      ...squatSession({ sets: [copied(1), copied(2), copied(3)] }),
      finished: false,
    });

    await publicApi().DELETE("/v1/workout-session-sets/{id}", {
      params: { path: { id: "session-1-e1-s2" } },
    });
    await publicApi().POST("/v1/workout-sessions/{id}/finish", {
      params: { path: { id: "session-1" } },
    });

    await expect(planUpdate(true, optIn)).resolves.toMatchObject({
      changes: [],
      set_removals: [
        { exercise_slug: "test-squat", sets: [{ reps: 8, weight: 50.5 }] },
      ],
    });

    const { data } = await publicApi().GET("/v1/plans/{id}", {
      params: { path: { id: "plan-1" } },
    });

    expect(
      data?.data.workouts[0].exercises[0].sets.map(
        ({ order, reps_recommended }) => [order, reps_recommended]
      )
    ).toStrictEqual([
      [1, 10],
      [2, 6],
    ]);
  });

  it("finds no other User's or missing Workout Session, and changes nothing", async () => {
    await seed({ ...main, userId: "user_other" });
    const before = rowsOf();
    const missing = { code: "not_found", status: 404 };

    await expect(planUpdate(false)).rejects.toMatchObject(missing);
    await expect(planUpdate(true)).rejects.toMatchObject(missing);
    await expect(planUpdate(true, optIn, "nowhere")).rejects.toMatchObject(
      missing
    );

    expect(rowsOf()).toStrictEqual(before);
  });
});
