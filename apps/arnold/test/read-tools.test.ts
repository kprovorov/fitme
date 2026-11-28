import type * as Db from "@fitme/db";
import type * as Observability from "@fitme/observability/node";
import type * as NoteServices from "@fitme/services/exercise-notes";
import type { ExerciseNote } from "@fitme/services/exercise-notes";
import type * as PlanServices from "@fitme/services/plans";
import type * as SessionServices from "@fitme/services/workout-sessions";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type * as LibraryModule from "../agent/lib/library";
import { LIBRARY_OUTAGE, testBundle, testLibrary } from "./library";
import {
  contextFor,
  inputSchemaOf,
  userIdFields,
  withClientContext,
} from "./tool-context";
import type { TestedTool } from "./tool-context";

type ReadTransaction = (transaction: typeof tx) => Promise<unknown>;

const db = vi.hoisted(() => ({
  asUser: vi.fn<(userId: string, fn: ReadTransaction) => Promise<unknown>>(),
}));

const notes = vi.hoisted(() => ({
  listExerciseNotes:
    vi.fn<
      (transaction: typeof tx, userId: string) => Promise<ExerciseNote[]>
    >(),
}));

const plans = vi.hoisted(() => ({
  getActivePlan:
    vi.fn<
      (transaction: typeof tx, userId: string) => Promise<typeof plan | null>
    >(),
  getPlan:
    vi.fn<
      (
        transaction: typeof tx,
        userId: string,
        planId: string
      ) => Promise<typeof plan | null>
    >(),
  listPlans:
    vi.fn<
      (transaction: typeof tx, userId: string) => Promise<(typeof plan)[]>
    >(),
}));

const sessions = vi.hoisted(() => ({
  getWorkoutSession:
    vi.fn<
      (
        transaction: typeof tx,
        id: string
      ) => Promise<SessionServices.WorkoutSessionDetail | null>
    >(),
  listWorkoutHistory:
    vi.fn<
      (
        transaction: typeof tx,
        options: { limit: number }
      ) => Promise<typeof history>
    >(),
  listWorkoutSessions:
    vi.fn<
      (
        transaction: typeof tx,
        options: SessionServices.ListWorkoutSessionsOptions
      ) => Promise<{ sessions: { id: string }[]; total: number }>
    >(),
}));

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Db | typeof db>(import("@fitme/db"), () => db);

vi.mock<typeof NoteServices | typeof notes>(
  import("@fitme/services/exercise-notes"),
  () => notes
);

vi.mock<typeof PlanServices | typeof plans>(
  import("@fitme/services/plans"),
  () => plans
);

vi.mock<typeof SessionServices | typeof sessions>(
  import("@fitme/services/workout-sessions"),
  () => sessions
);

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

vi.mock<typeof LibraryModule>(import("../agent/lib/library"), async () => {
  const { testLibrary: library } = await import("./library");

  return { getLibrary: () => library.get() };
});

const { default: getActivePlan } =
  await import("../agent/tools/get_active_plan");

const { default: getOpenWorkoutSession } =
  await import("../agent/tools/get_open_workout_session");

const { default: getPlan } = await import("../agent/tools/get_plan");

const { default: getPlans } = await import("../agent/tools/get_plans");

const { default: getWorkoutsHistory } =
  await import("../agent/tools/get_workouts_history");

const { default: searchExercises } =
  await import("../agent/tools/search_exercises");

const { default: displayWorkoutPlan } =
  await import("../agent/tools/display_workout_plan");

const tx = { fake: "transaction" };

type ModelInput = Record<
  string,
  string | number | readonly object[] | readonly string[]
>;

/** What eve hands `execute` after validating the model's input. */
const parseInput = <Input>(tool: TestedTool<Input>, input: ModelInput) =>
  inputSchemaOf(tool).parse(input);

const alice = contextFor("user_alice");

const set = {
  id: "set_1",
  order: 1,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_recommended: 60,
};

/** A Workout Exercise as the services return it. */
const planExercise = (id: string, slug: string) => ({
  exercise_slug: slug,
  id,
  order: 1,
  sets: [set],
});

const plan = {
  id: "plan_1",
  is_active: true,
  name: "Push pull",
  workouts: [
    {
      description: "Push",
      exercises: [
        planExercise("we_bench", "bench-press"),
        planExercise("we_retired", "jefferson-curl"),
      ],
      id: "workout_1",
      name: "Push",
      order: 1,
    },
  ],
};

/**
 * The Plan a User built by hand (ADR 0017): its goal, place, experience level
 * and workout duration unset, as the services answer them.
 */
const unsetDetailsPlan = {
  ...plan,
  experience_level: null,
  goal: null,
  place: null,
  workout_duration: null,
};

const loggedSet = {
  ...set,
  logged_at: null,
  note: "Grip slipped",
  reps_completed: 8,
};

const history = [
  {
    exercises: [
      {
        exercise_slug: "back-squat",
        id: "wse_squat",
        order: 1,
        sets: [loggedSet],
      },
    ],
    id: "session_1",
    status: "finished",
  },
];

/** Logged, then a gap where a set was removed (ADR 0023), then one to go. */
const openSets: SessionServices.WorkoutSessionSet[] = [
  {
    id: "wss_1",
    logged_at: "2026-10-14T18:05:00+00:00",
    note: "Too heavy",
    order: 1,
    reps_completed: 8,
    reps_recommended: 8,
    rest_recommended: 90,
    weight_completed: 62.5,
    weight_recommended: 60,
  },
  {
    id: "wss_3",
    logged_at: null,
    note: null,
    order: 3,
    reps_completed: null,
    reps_recommended: 8,
    rest_recommended: 90,
    weight_completed: null,
    weight_recommended: 60,
  },
];

const openSession: SessionServices.WorkoutSessionDetail = {
  exercises: [
    {
      exercise_slug: "back-squat",
      id: "wse_squat",
      order: 1,
      sets: openSets,
    },
    {
      exercise_slug: "jefferson-curl",
      id: "wse_retired",
      order: 2,
      sets: [],
    },
  ],
  finished_at: null,
  id: "session_open",
  plan: { id: "plan_1", name: "Push pull" },
  started_at: "2026-10-14T18:00:00+00:00",
  status: "in_progress",
  workout: { id: "workout_1", name: "Push" },
};

/** Every argument asUser and the services were called with. */
const seenArguments = () =>
  JSON.stringify([
    db.asUser.mock.calls,
    notes.listExerciseNotes.mock.calls,
    plans.getActivePlan.mock.calls,
    plans.getPlan.mock.calls,
    plans.listPlans.mock.calls,
    sessions.getWorkoutSession.mock.calls,
    sessions.listWorkoutSessions.mock.calls,
    sessions.listWorkoutHistory.mock.calls,
  ]);

/** Validate the read tool's result before inspecting its Exercises. */
const foundExerciseSchema = z.object({
  exercise_slug: z.string(),
  muscle_groups: z.array(z.string()),
  name: z.string(),
});

/** A read tool's Exercise: a found one plus the User's Exercise note. */
const shownExerciseSchema = foundExerciseSchema.extend({
  exercise_note: z.string().nullable(),
});

const shownPlanSchema = z.object({
  workouts: z.array(z.object({ exercises: z.array(shownExerciseSchema) })),
});

const shownSessionSchema = z.object({
  exercises: z.array(shownExerciseSchema),
});

const shownHistorySchema = z.array(
  z.object({ exercises: z.array(shownExerciseSchema) })
);

const exercise = (slug: string, name: string) => ({
  exercise_slug: slug,
  name,
  reps: "8-10",
  sets: 3,
});

const proposed = (...exercises: ReturnType<typeof exercise>[]) => ({
  description: "Three full-body days",
  frequencyPerWeek: 3,
  goal: "muscle_gain",
  name: "Full body",
  workouts: [{ dayLabel: "Monday", exercises, name: "Day A" }],
});

const run = async (input: ModelInput) =>
  await displayWorkoutPlan.execute(
    parseInput(displayWorkoutPlan, input),
    alice
  );

/** A stored Exercise note, as `listExerciseNotes` answers it. */
const storedNote = (
  exercise_slug: string,
  note: string,
  updated_at = "2026-11-26T10:00:00+00:00"
): ExerciseNote => ({ exercise_slug, note, updated_at });

const KNEE = "Knee hurts below parallel";
const ARCH = "Arch, feet flat";

/** The Exercise notes the read tools showed, by stored slug. */
const shownNotes = (exercises: readonly { exercise_slug: string }[]) =>
  Object.fromEntries(
    z
      .array(
        z.object({
          exercise_note: z.string().nullable(),
          exercise_slug: z.string(),
        })
      )
      .parse(exercises)
      .map(({ exercise_note, exercise_slug }) => [exercise_slug, exercise_note])
  );

/** asUser ran once, and the notes were read inside it, as the owner. */
const expectNotesReadInTheTransaction = () => {
  expect(db.asUser).toHaveBeenCalledExactlyOnceWith(
    "user_alice",
    expect.any(Function)
  );
  expect(notes.listExerciseNotes).toHaveBeenCalledExactlyOnceWith(
    tx,
    "user_alice"
  );
};

const resetReadTools = () => {
  testLibrary.reset();
  db.asUser.mockImplementation(async (_userId, fn) => await fn(tx));
  notes.listExerciseNotes.mockResolvedValue([]);
  plans.getActivePlan.mockResolvedValue(plan);
  plans.getPlan.mockResolvedValue(plan);
  plans.listPlans.mockResolvedValue([plan]);
  sessions.getWorkoutSession.mockResolvedValue(openSession);
  sessions.listWorkoutHistory.mockResolvedValue(history);
  sessions.listWorkoutSessions.mockResolvedValue({
    sessions: [{ id: openSession.id }],
    total: 1,
  });
  observability.reportError.mockResolvedValue(undefined);
};

describe("get_active_plan", () => {
  beforeEach(resetReadTools);

  it("reads the active Plan as the session's User", async () => {
    const input = parseInput(getActivePlan, userIdFields);

    await getActivePlan.execute(input, alice);

    expect(input).toStrictEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.getActivePlan).toHaveBeenCalledWith(tx, "user_alice");
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("names each Exercise from the library, and from its slug when the library doesn't know it", async () => {
    await expect(getActivePlan.execute({}, alice)).resolves.toStrictEqual({
      ...plan,
      plan_version: expect.any(String),
      workouts: [
        {
          ...plan.workouts[0],
          exercises: [
            {
              exercise_slug: "bench-press",
              id: "we_bench",
              muscle_groups: ["chest"],
              name: "Bench Press",
              exercise_note: null,
              order: 1,
              sets: [set],
            },
            {
              exercise_slug: "jefferson-curl",
              id: "we_retired",
              muscle_groups: [],
              name: "Jefferson curl",
              exercise_note: null,
              order: 1,
              sets: [set],
            },
          ],
        },
      ],
    });
  });

  it("names an old slug as the Exercise replacing it, keeping the stored slug", async () => {
    plans.getActivePlan.mockResolvedValue({
      ...plan,
      workouts: [
        {
          ...plan.workouts[0],
          exercises: [planExercise("we_old", "barbell-bench-press")],
        },
      ],
    });

    const answer = await getActivePlan.execute({}, alice);

    expect(answer).toMatchObject({
      workouts: [
        {
          exercises: [
            {
              exercise_slug: "barbell-bench-press",
              muscle_groups: ["chest"],
              name: "Bench Press",
            },
          ],
        },
      ],
    });
  });

  it("still answers, with slug-derived names, when the library can't load, and reports it", async () => {
    testLibrary.reset({ loads: "fail" });

    const answer = shownPlanSchema.parse(
      await getActivePlan.execute({}, alice)
    );

    expect(answer.workouts[0].exercises.map(({ name }) => name)).toStrictEqual([
      "Bench press",
      "Jefferson curl",
    ]);
    expect(observability.reportError).toHaveBeenCalledWith(LIBRARY_OUTAGE, {
      exercise_library: "library",
    });
  });

  it("answers a Plan whose details are unset, passing each on as null", async () => {
    plans.getActivePlan.mockResolvedValue(unsetDetailsPlan);

    const answer = await getActivePlan.execute({}, alice);

    expect(answer).toMatchObject({
      experience_level: null,
      goal: null,
      place: null,
      workout_duration: null,
    });
    // The Exercises are still named from the library.
    expect(shownPlanSchema.parse(answer).workouts[0].exercises[0].name).toBe(
      "Bench Press"
    );
  });

  it("shows the User's Exercise note beside each Exercise, null without one, read in the same transaction", async () => {
    notes.listExerciseNotes.mockResolvedValue([
      storedNote("bench-press", ARCH),
      storedNote("deadlift", "Not in this Plan"),
    ]);

    const answer = shownPlanSchema.parse(
      await getActivePlan.execute({}, alice)
    );

    expect(shownNotes(answer.workouts[0].exercises)).toStrictEqual({
      "bench-press": ARCH,
      "jefferson-curl": null,
    });
    expectNotesReadInTheTransaction();
  });

  it("shows the note saved under the Exercise replacing an old slug, and one saved under the old slug itself", async () => {
    plans.getActivePlan.mockResolvedValue({
      ...plan,
      workouts: [
        {
          ...plan.workouts[0],
          exercises: [
            planExercise("we_old", "barbell-bench-press"),
            planExercise("we_retired", "jefferson-curl"),
          ],
        },
      ],
    });
    notes.listExerciseNotes.mockResolvedValue([
      storedNote("bench-press", ARCH),
      storedNote("jefferson-curl", "Slow"),
    ]);

    const answer = shownPlanSchema.parse(
      await getActivePlan.execute({}, alice)
    );

    expect(shownNotes(answer.workouts[0].exercises)).toStrictEqual({
      "barbell-bench-press": ARCH,
      "jefferson-curl": "Slow",
    });
  });

  it("shows the later changed note when both an old slug and its replacement have one", async () => {
    plans.getActivePlan.mockResolvedValue({
      ...plan,
      workouts: [
        {
          ...plan.workouts[0],
          exercises: [planExercise("we_old", "barbell-bench-press")],
        },
      ],
    });
    notes.listExerciseNotes.mockResolvedValue([
      storedNote("barbell-bench-press", "Old cue", "2026-11-20T10:00:00+00:00"),
      storedNote("bench-press", ARCH, "2026-11-26T10:00:00+00:00"),
    ]);

    const first = shownPlanSchema.parse(await getActivePlan.execute({}, alice));

    expect(shownNotes(first.workouts[0].exercises)).toStrictEqual({
      "barbell-bench-press": ARCH,
    });

    notes.listExerciseNotes.mockResolvedValue([
      storedNote("barbell-bench-press", "New cue", "2026-11-27T10:00:00+00:00"),
      storedNote("bench-press", ARCH, "2026-11-26T10:00:00+00:00"),
    ]);

    const second = shownPlanSchema.parse(
      await getActivePlan.execute({}, alice)
    );

    expect(shownNotes(second.workouts[0].exercises)).toStrictEqual({
      "barbell-bench-press": "New cue",
    });
  });

  it("keeps each set's own note apart from the Exercise note", async () => {
    notes.listExerciseNotes.mockResolvedValue([storedNote("back-squat", KNEE)]);

    const [session] = z
      .array(
        z.object({
          exercises: z.array(
            z.object({
              exercise_note: z.string().nullable(),
              sets: z.array(z.object({ note: z.string().nullable() })),
            })
          ),
        })
      )
      .parse(await getWorkoutsHistory.execute({ limit: 10 }, alice));

    expect(session.exercises[0].exercise_note).toBe(KNEE);
    expect(session.exercises[0].sets[0].note).toBe("Grip slipped");
  });

  it("still shows the notes when the library can't load", async () => {
    testLibrary.reset({ loads: "fail" });
    notes.listExerciseNotes.mockResolvedValue([
      storedNote("bench-press", ARCH),
    ]);

    const answer = shownPlanSchema.parse(
      await getActivePlan.execute({}, alice)
    );

    expect(shownNotes(answer.workouts[0].exercises)).toStrictEqual({
      "bench-press": ARCH,
      "jefferson-curl": null,
    });
  });

  it("reads no notes without an active Plan", async () => {
    plans.getActivePlan.mockResolvedValue(null);

    await getActivePlan.execute({}, alice);

    expect(notes.listExerciseNotes).not.toHaveBeenCalled();
  });

  it("tells the model when no Plan is active", async () => {
    plans.getActivePlan.mockResolvedValue(null);

    await expect(getActivePlan.execute({}, alice)).resolves.toStrictEqual({
      error: "No active plan found",
    });
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(getActivePlan.execute({}, contextFor(null))).rejects.toThrow(
      "This Conversation has no signed-in owner"
    );
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

const PLAN_ID = "5d0c1f9e-3b7a-4c2e-9f41-0a6b8e2d7c13";

const markerSchema = z.object({ plan_version: z.string().min(1) });

/** The marker a Plan read answered. */
const markerOf = (answer: unknown) => markerSchema.parse(answer).plan_version;

/** The test Plan with its first set's reps target changed. */
const withChangedSet = (reps: number) => ({
  ...plan,
  workouts: [
    {
      ...plan.workouts[0],
      exercises: [
        {
          ...planExercise("we_bench", "bench-press"),
          sets: [{ ...set, reps_recommended: reps }],
        },
        planExercise("we_retired", "jefferson-curl"),
      ],
    },
  ],
});

describe("the Plan version marker", () => {
  beforeEach(resetReadTools);

  it("is the same on every read of an unchanged Plan, from either tool", async () => {
    const first = markerOf(await getActivePlan.execute({}, alice));
    const second = markerOf(await getActivePlan.execute({}, alice));
    const byId = markerOf(await getPlan.execute({ plan_id: PLAN_ID }, alice));

    expect(second).toBe(first);
    expect(byId).toBe(first);
  });

  it("changes once the Plan does, from either tool", async () => {
    const before = markerOf(await getActivePlan.execute({}, alice));

    plans.getActivePlan.mockResolvedValue(withChangedSet(12));
    plans.getPlan.mockResolvedValue(withChangedSet(12));

    const active = markerOf(await getActivePlan.execute({}, alice));
    const byId = markerOf(await getPlan.execute({ plan_id: PLAN_ID }, alice));

    expect(active).not.toBe(before);
    expect(byId).toBe(active);
  });

  it("doesn't change when only the Exercise names or notes shown beside it do", async () => {
    const before = markerOf(await getActivePlan.execute({}, alice));

    notes.listExerciseNotes.mockResolvedValue([
      storedNote("bench-press", ARCH),
    ]);
    testLibrary.reset({ loads: "fail" });

    expect(markerOf(await getActivePlan.execute({}, alice))).toBe(before);
  });
});

describe("get_plan", () => {
  beforeEach(resetReadTools);

  it("reads the Plan by its id as the session's User, never one named in the input", async () => {
    const input = parseInput(getPlan, { ...userIdFields, plan_id: PLAN_ID });

    await getPlan.execute(input, alice);

    expect(input).toStrictEqual({ plan_id: PLAN_ID });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.getPlan).toHaveBeenCalledExactlyOnceWith(
      tx,
      "user_alice",
      PLAN_ID
    );
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("refuses an id that isn't one", () => {
    expect(
      inputSchemaOf(getPlan).safeParse({ plan_id: "plan_1" }).success
    ).toBeFalsy();
  });

  it("answers the Plan in full, as get_active_plan does", async () => {
    notes.listExerciseNotes.mockResolvedValue([
      storedNote("bench-press", ARCH),
    ]);

    const answer = await getPlan.execute({ plan_id: PLAN_ID }, alice);

    expect(answer).toStrictEqual(await getActivePlan.execute({}, alice));
    expect(answer).toMatchObject({
      id: "plan_1",
      workouts: [
        {
          exercises: [
            {
              exercise_note: ARCH,
              exercise_slug: "bench-press",
              id: "we_bench",
              muscle_groups: ["chest"],
              name: "Bench Press",
              sets: [set],
            },
            {
              exercise_note: null,
              exercise_slug: "jefferson-curl",
              id: "we_retired",
              muscle_groups: [],
              name: "Jefferson curl",
            },
          ],
          id: "workout_1",
        },
      ],
    });
  });

  it("reads the notes in the same transaction as the Plan", async () => {
    await getPlan.execute({ plan_id: PLAN_ID }, alice);

    expectNotesReadInTheTransaction();
    expect(plans.getPlan).toHaveBeenCalledExactlyOnceWith(
      tx,
      "user_alice",
      PLAN_ID
    );
  });

  it("names Exercises in the App language", async () => {
    const answer = shownPlanSchema.parse(
      await getPlan.execute(
        { plan_id: PLAN_ID },
        withClientContext(alice, { language: "uk" })
      )
    );

    expect(answer.workouts[0].exercises[0].name).toBe("Жим лежачи");
  });

  it("sends the model to get_plans for a Plan it can't read: missing, deleted or another User's", async () => {
    plans.getPlan.mockResolvedValue(null);

    await expect(
      getPlan.execute({ plan_id: PLAN_ID }, alice)
    ).resolves.toStrictEqual({
      error:
        "No plan found with that ID. Call get_plans for the user's plans and their IDs.",
    });
    expect(notes.listExerciseNotes).not.toHaveBeenCalled();
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      getPlan.execute({ plan_id: PLAN_ID }, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("get_plans", () => {
  beforeEach(resetReadTools);

  it("lists the Plans as the session's User", async () => {
    const input = parseInput(getPlans, userIdFields);

    await expect(getPlans.execute(input, alice)).resolves.toStrictEqual([plan]);
    expect(input).toStrictEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(plans.listPlans).toHaveBeenCalledWith(tx, "user_alice");
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("lists a Plan whose details are unset, passing each on as null", async () => {
    plans.listPlans.mockResolvedValue([unsetDetailsPlan]);

    await expect(getPlans.execute({}, alice)).resolves.toStrictEqual([
      unsetDetailsPlan,
    ]);
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(getPlans.execute({}, contextFor(null))).rejects.toThrow(
      "This Conversation has no signed-in owner"
    );
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("get_workouts_history", () => {
  beforeEach(resetReadTools);

  it("reads the latest finished sessions as the session's User, Exercises named from the library", async () => {
    const input = parseInput(getWorkoutsHistory, {
      ...userIdFields,
      limit: 3,
    });

    await expect(
      getWorkoutsHistory.execute(input, alice)
    ).resolves.toStrictEqual([
      {
        ...history[0],
        exercises: [
          {
            exercise_slug: "back-squat",
            id: "wse_squat",
            muscle_groups: ["quadriceps", "glutes"],
            name: "Back Squat",
            exercise_note: null,
            order: 1,
            sets: [loggedSet],
          },
        ],
      },
    ]);
    expect(input).toStrictEqual({ limit: 3 });
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(sessions.listWorkoutHistory).toHaveBeenCalledWith(tx, {
      limit: 3,
    });
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("names an old slug as the Exercise replacing it", async () => {
    sessions.listWorkoutHistory.mockResolvedValue([
      {
        ...history[0],
        exercises: [
          { ...history[0].exercises[0], exercise_slug: "barbell-bench-press" },
        ],
      },
    ]);

    const [session] = shownHistorySchema.parse(
      await getWorkoutsHistory.execute({ limit: 10 }, alice)
    );

    expect(session.exercises[0]).toMatchObject({
      exercise_slug: "barbell-bench-press",
      name: "Bench Press",
    });
  });

  it("still answers, with slug-derived names, when the library can't load", async () => {
    testLibrary.reset({ loads: "fail" });

    const [session] = shownHistorySchema.parse(
      await getWorkoutsHistory.execute({ limit: 10 }, alice)
    );

    expect(session.exercises[0]).toMatchObject({
      muscle_groups: [],
      name: "Back squat",
    });
    expect(observability.reportError).toHaveBeenCalledWith(LIBRARY_OUTAGE, {
      exercise_library: "library",
    });
  });

  it("shows the User's Exercise note beside each Exercise, read in the same transaction", async () => {
    notes.listExerciseNotes.mockResolvedValue([storedNote("back-squat", KNEE)]);

    const [session] = shownHistorySchema.parse(
      await getWorkoutsHistory.execute({ limit: 10 }, alice)
    );

    expect(shownNotes(session.exercises)).toStrictEqual({
      "back-squat": KNEE,
    });
    expectNotesReadInTheTransaction();
  });

  it("reads 10 sessions by default and at most 20", () => {
    expect(parseInput(getWorkoutsHistory, {})).toStrictEqual({ limit: 10 });
    expect(() => parseInput(getWorkoutsHistory, { limit: 21 })).toThrow(
      "Too big"
    );
    expect(() => parseInput(getWorkoutsHistory, { limit: 0 })).toThrow(
      "Too small"
    );
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      getWorkoutsHistory.execute({ limit: 10 }, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("get_open_workout_session", () => {
  beforeEach(resetReadTools);

  const none = { error: "No workout session is open" };

  it("reads the open Workout Session in full as the Conversation's owner, Exercises named from the library", async () => {
    await expect(
      getOpenWorkoutSession.execute({}, alice)
    ).resolves.toStrictEqual({
      ...openSession,
      exercises: [
        {
          exercise_slug: "back-squat",
          id: "wse_squat",
          muscle_groups: ["quadriceps", "glutes"],
          name: "Back Squat",
          exercise_note: null,
          order: 1,
          sets: openSets,
        },
        {
          exercise_slug: "jefferson-curl",
          id: "wse_retired",
          muscle_groups: [],
          name: "Jefferson curl",
          exercise_note: null,
          order: 2,
          sets: [],
        },
      ],
    });
    expect(db.asUser).toHaveBeenCalledExactlyOnceWith(
      "user_alice",
      expect.any(Function)
    );
    expect(sessions.listWorkoutSessions).toHaveBeenCalledWith(tx, {
      limit: 1,
      offset: 0,
      status: "in_progress",
    });
    expect(sessions.getWorkoutSession).toHaveBeenCalledWith(tx, "session_open");
  });

  it("takes no User id", async () => {
    const input = parseInput(getOpenWorkoutSession, userIdFields);

    await getOpenWorkoutSession.execute(input, alice);

    expect(input).toStrictEqual({});
    expect(seenArguments()).not.toContain("user_mallory");
  });

  it("names the Exercises in the App language", async () => {
    const answer = shownSessionSchema.parse(
      await getOpenWorkoutSession.execute(
        {},
        withClientContext(alice, { language: "uk" })
      )
    );

    expect(answer.exercises[0].name).toBe("Присідання зі штангою");
  });

  it("answers a Workout Session whose Workout is gone", async () => {
    sessions.getWorkoutSession.mockResolvedValue({
      ...openSession,
      plan: null,
      workout: null,
    });

    await expect(
      getOpenWorkoutSession.execute({}, alice)
    ).resolves.toMatchObject({
      id: "session_open",
      plan: null,
      workout: null,
    });
  });

  it("still answers, with slug-derived names, when the library can't load", async () => {
    testLibrary.reset({ loads: "fail" });

    const answer = shownSessionSchema.parse(
      await getOpenWorkoutSession.execute({}, alice)
    );

    expect(answer.exercises.map(({ name }) => name)).toStrictEqual([
      "Back squat",
      "Jefferson curl",
    ]);
    expect(observability.reportError).toHaveBeenCalledWith(LIBRARY_OUTAGE, {
      exercise_library: "library",
    });
  });

  it("shows the User's Exercise note beside each Exercise, null without one, read in the same transaction", async () => {
    notes.listExerciseNotes.mockResolvedValue([storedNote("back-squat", KNEE)]);

    const answer = shownSessionSchema.parse(
      await getOpenWorkoutSession.execute({}, alice)
    );

    expect(shownNotes(answer.exercises)).toStrictEqual({
      "back-squat": KNEE,
      "jefferson-curl": null,
    });
    expectNotesReadInTheTransaction();
  });

  it("still shows the notes when the library can't load", async () => {
    testLibrary.reset({ loads: "fail" });
    notes.listExerciseNotes.mockResolvedValue([storedNote("back-squat", KNEE)]);

    const answer = shownSessionSchema.parse(
      await getOpenWorkoutSession.execute({}, alice)
    );

    expect(shownNotes(answer.exercises)).toStrictEqual({
      "back-squat": KNEE,
      "jefferson-curl": null,
    });
  });

  it("tells the model when no Workout Session is open", async () => {
    sessions.listWorkoutSessions.mockResolvedValue({ sessions: [], total: 0 });

    await expect(
      getOpenWorkoutSession.execute({}, alice)
    ).resolves.toStrictEqual(none);
  });

  it("tells the model none is open when it is finished or discarded between the two reads", async () => {
    sessions.getWorkoutSession.mockResolvedValue({
      ...openSession,
      finished_at: "2026-10-14T19:00:00+00:00",
      status: "finished",
    });

    await expect(
      getOpenWorkoutSession.execute({}, alice)
    ).resolves.toStrictEqual(none);

    sessions.getWorkoutSession.mockResolvedValue(null);

    await expect(
      getOpenWorkoutSession.execute({}, alice)
    ).resolves.toStrictEqual(none);
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      getOpenWorkoutSession.execute({}, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("search_exercises", () => {
  beforeEach(resetReadTools);

  /** The slugs `search_exercises` answers for `input`. */
  const searchSlugs = async (input: ModelInput) => {
    const found = z
      .array(z.object({ exercise_slug: z.string() }))
      .parse(
        await searchExercises.execute(parseInput(searchExercises, input), alice)
      );

    return found.map(({ exercise_slug }) => exercise_slug);
  };

  it("searches the library by name and muscle group, answering slugs, Equipment, movement patterns and Difficulty", async () => {
    const input = parseInput(searchExercises, {
      ...userIdFields,
      muscle_group: "chest",
      query: "press",
    });

    await expect(searchExercises.execute(input, alice)).resolves.toStrictEqual([
      {
        difficulty: "intermediate",
        equipment: ["barbell", "bench"],
        exercise_slug: "bench-press",
        movement_patterns: ["push"],
        muscle_groups: ["chest"],
        name: "Bench Press",
      },
      {
        difficulty: "beginner",
        equipment: ["dumbbell", "bench"],
        exercise_slug: "incline-dumbbell-press",
        movement_patterns: ["push"],
        muscle_groups: ["chest"],
        name: "Incline Dumbbell Press",
      },
    ]);
    expect(input).toStrictEqual({ muscle_group: "chest", query: "press" });
  });

  it("answers the first 8 matches", async () => {
    const plank = testBundle.exercises.find(({ slug }) => slug === "plank");

    if (!plank) {
      throw new Error("testBundle has no plank");
    }

    testLibrary.reset({
      bundle: {
        ...testBundle,
        exercises: Array.from({ length: 10 }, (_, index) => ({
          ...plank,
          slug: `plank-${index}`,
        })),
        replaced_slugs: {},
      },
    });

    await expect(searchSlugs({ query: "plank" })).resolves.toStrictEqual(
      Array.from({ length: 8 }, (_, index) => `plank-${index}`)
    );
  });

  it("takes the new muscle groups, matching primary ones only", async () => {
    await expect(searchSlugs({ muscle_group: "core" })).resolves.toStrictEqual([
      "plank",
    ]);
    // the Pull-up trains the biceps only as a secondary muscle group
    await expect(
      searchSlugs({ muscle_group: "biceps" })
    ).resolves.toStrictEqual([]);
  });

  it("only takes a muscle group of the new Library", () => {
    expect(() =>
      parseInput(searchExercises, { muscle_group: "wings" })
    ).toThrow("Invalid option");
    // abs is the Legacy Library's
    expect(() => parseInput(searchExercises, { muscle_group: "abs" })).toThrow(
      "Invalid option"
    );
  });

  it("finds an Exercise by one of its other English names", async () => {
    await expect(searchSlugs({ query: "flat" })).resolves.toStrictEqual([
      "bench-press",
    ]);
  });

  it("narrows the search to exercises using any of the given equipment", async () => {
    await expect(
      searchSlugs({ equipment: ["dumbbell"] })
    ).resolves.toStrictEqual(["incline-dumbbell-press"]);
  });

  it("matches an exercise using any one of several pieces of equipment", async () => {
    await expect(
      searchSlugs({ equipment: ["barbell", "dumbbell"], muscle_group: "chest" })
    ).resolves.toStrictEqual(["bench-press", "incline-dumbbell-press"]);
  });

  it("finds bodyweight exercises, the Pull-up among them only alongside its bar", async () => {
    await expect(
      searchSlugs({ equipment: ["bodyweight"], muscle_group: "back" })
    ).resolves.toStrictEqual(["pull-up"]);
    await expect(
      searchSlugs({ equipment: ["bodyweight", "pull_up_bar"] })
    ).resolves.toStrictEqual(["plank", "pull-up"]);
  });

  it("combines equipment with the muscle group and the query", async () => {
    await expect(
      searchSlugs({
        equipment: ["bench"],
        muscle_group: "chest",
        query: "bench",
      })
    ).resolves.toStrictEqual(["bench-press"]);
  });

  it("takes the new Library's Equipment, and nothing else", async () => {
    await expect(
      searchSlugs({ equipment: ["kettlebell"] })
    ).resolves.toStrictEqual([]);
    expect(() =>
      parseInput(searchExercises, { equipment: ["jetpack"] })
    ).toThrow("Invalid option");
  });

  it("tells the model to add bodyweight, and pull_up_bar only when the User has one", () => {
    const schema = JSON.stringify(
      z.toJSONSchema(inputSchemaOf(searchExercises))
    );

    expect(schema).toContain("add bodyweight");
    expect(schema).toContain("pull_up_bar only when the user has one");
  });

  it("asks to retry when the library can't load, and reports it", async () => {
    testLibrary.reset({ loads: "fail" });

    await expect(searchExercises.execute({}, alice)).resolves.toStrictEqual({
      error:
        "The exercise library is unavailable right now, so the search failed. Try again in a moment.",
    });
    expect(observability.reportError).toHaveBeenCalledWith(LIBRARY_OUTAGE, {
      exercise_library: "library",
    });
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(searchExercises.execute({}, contextFor(null))).rejects.toThrow(
      "This Conversation has no signed-in owner"
    );
  });
});

describe("the App language", () => {
  beforeEach(resetReadTools);

  const inUkrainian = withClientContext(alice, { language: "uk" });
  const inEnglish = withClientContext(alice, { language: "en" });
  const inUnsupportedLanguage = withClientContext(alice, { language: "ru" });

  /** The names `get_active_plan` gives the active Plan's Exercises. */
  const planNames = async (ctx: typeof alice) => {
    plans.getActivePlan.mockResolvedValue({
      ...plan,
      workouts: [
        {
          ...plan.workouts[0],
          exercises: [
            planExercise("we_bench", "bench-press"),
            planExercise("we_incline", "incline-dumbbell-press"),
            planExercise("we_retired", "jefferson-curl"),
          ],
        },
      ],
    });

    const answer = shownPlanSchema.parse(await getActivePlan.execute({}, ctx));

    return answer.workouts[0].exercises.map(({ name }) => name);
  };

  /** The names `search_exercises` answers for `query`. */
  const searchNames = async (ctx: typeof alice, query?: string) => {
    const found = z
      .array(foundExerciseSchema)
      .parse(
        await searchExercises.execute({ muscle_group: "chest", query }, ctx)
      );

    return found.map(({ name }) => name);
  };

  it("names a Plan's Exercises in Ukrainian, an untranslated one in English and an unknown one from its slug", async () => {
    await expect(planNames(inUkrainian)).resolves.toStrictEqual([
      "Жим лежачи",
      "Incline Dumbbell Press",
      "Jefferson curl",
    ]);
  });

  it("names a Plan's Exercises in English without a language, in English and in a language that isn't an App language", async () => {
    const english = ["Bench Press", "Incline Dumbbell Press", "Jefferson curl"];

    await expect(planNames(alice)).resolves.toStrictEqual(english);
    await expect(planNames(inEnglish)).resolves.toStrictEqual(english);
    await expect(planNames(inUnsupportedLanguage)).resolves.toStrictEqual(
      english
    );
  });

  it("names the workout history's Exercises in the App language, keeping their muscle groups", async () => {
    const shown = async (ctx: typeof alice) => {
      const [session] = shownHistorySchema.parse(
        await getWorkoutsHistory.execute({ limit: 10 }, ctx)
      );

      return session.exercises[0];
    };

    await expect(shown(inUkrainian)).resolves.toMatchObject({
      muscle_groups: ["quadriceps", "glutes"],
      name: "Присідання зі штангою",
    });
    await expect(shown(alice)).resolves.toMatchObject({ name: "Back Squat" });
    await expect(shown(inUnsupportedLanguage)).resolves.toMatchObject({
      name: "Back Squat",
    });
  });

  it("names the workout history's untranslated Exercises in English", async () => {
    sessions.listWorkoutHistory.mockResolvedValue([
      {
        ...history[0],
        exercises: [
          {
            ...history[0].exercises[0],
            exercise_slug: "incline-dumbbell-press",
          },
        ],
      },
    ]);

    const [session] = shownHistorySchema.parse(
      await getWorkoutsHistory.execute({ limit: 10 }, inUkrainian)
    );

    expect(session.exercises[0].name).toBe("Incline Dumbbell Press");
  });

  it("answers search results in Ukrainian, an untranslated one in English, in Ukrainian order", async () => {
    await expect(searchNames(inUkrainian)).resolves.toStrictEqual([
      "Жим лежачи",
      "Incline Dumbbell Press",
    ]);
  });

  it("answers search results in English without a language or with one that isn't an App language", async () => {
    const english = ["Bench Press", "Incline Dumbbell Press"];

    await expect(searchNames(alice)).resolves.toStrictEqual(english);
    await expect(searchNames(inEnglish)).resolves.toStrictEqual(english);
    await expect(searchNames(inUnsupportedLanguage)).resolves.toStrictEqual(
      english
    );
  });

  it("finds an Exercise by its Ukrainian name, and still by its English one", async () => {
    await expect(searchNames(inUkrainian, "жим")).resolves.toStrictEqual([
      "Жим лежачи",
    ]);
    await expect(searchNames(inUkrainian, "bench")).resolves.toStrictEqual([
      "Жим лежачи",
    ]);
  });

  it("answers an equipment-filtered search in the App language", async () => {
    const found = z
      .array(foundExerciseSchema)
      .parse(
        await searchExercises.execute(
          { equipment: ["dumbbell", "bench"] },
          inUkrainian
        )
      );

    expect(found.map(({ name }) => name)).toStrictEqual([
      "Жим лежачи",
      "Incline Dumbbell Press",
    ]);
  });
});

describe("display_workout_plan", () => {
  beforeEach(resetReadTools);

  it("returns the proposed Plan as given, Exercises by exercise_slug only", async () => {
    const card = proposed(exercise("bench-press", "Bench press"));

    await expect(run(card)).resolves.toStrictEqual(card);
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("carries no Exercise note: one the model adds to an Exercise is dropped", async () => {
    const card = proposed(exercise("bench-press", "Bench press"));
    const [workout] = card.workouts;

    await expect(
      run({
        ...card,
        workouts: [
          {
            ...workout,
            exercises: workout.exercises.map((shown) => ({
              ...shown,
              note: ARCH,
            })),
          },
        ],
      })
    ).resolves.toStrictEqual(card);
    expect(notes.listExerciseNotes).not.toHaveBeenCalled();
  });

  it("takes an old slug the Library maps to its replacement, as sent", async () => {
    const card = proposed(exercise("barbell-bench-press", "Bench press"));

    await expect(run(card)).resolves.toStrictEqual(card);
  });

  it("refuses an old slug once the Library drops its map, so the app shows its unknown exercises message", async () => {
    const { replaced_slugs: _map, ...withoutMap } = testBundle;
    testLibrary.reset({ bundle: withoutMap });

    await expect(
      run(proposed(exercise("barbell-bench-press", "Bench press")))
    ).rejects.toThrow("Unknown exercise_slug(s): barbell-bench-press");
  });

  it("refuses a slug the Library doesn't know with a tool error, never a result the app would render", async () => {
    await expect(run(proposed(exercise("made-up-fly", "Fly")))).rejects.toThrow(
      "made-up-fly"
    );
  });

  it("sends an old exercise id back to search_exercises by name with a tool error", async () => {
    await expect(
      run(proposed(exercise("c0000000-0000-4000-8000-000000000001", "Fly")))
    ).rejects.toThrow(/search_exercises with the exercise's name/u);
  });

  // Arnold's Plans always carry a goal, whatever the Public API now takes
  // (ADR 0017): the card's input is unchanged.
  it("still refuses a card without a goal", () => {
    const { goal: _goal, ...withoutGoal } = proposed(
      exercise("bench-press", "Bench press")
    );

    expect(() => parseInput(displayWorkoutPlan, withoutGoal)).toThrow(/goal/iu);
  });

  it("asks to retry with a tool error when the Library can't load", async () => {
    testLibrary.reset({ loads: "fail" });

    await expect(
      run(proposed(exercise("bench-press", "Bench")))
    ).rejects.toThrow("Try again");
    expect(observability.reportError).toHaveBeenCalledWith(
      LIBRARY_OUTAGE,
      expect.anything()
    );
  });
});
