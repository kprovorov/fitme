import { arnoldCardIds, arnoldCards } from "@fitme/core/arnold";
import type { ToolStub } from "eve/evals";
import { z } from "zod";

/**
 * What Arnold's read tools return for a made-up User, shaped like the
 * tools' output (Exercises by exercise_slug, named from the library, each
 * with the User's Exercise note, none here). Every eval session stubs the tools it may call, so no
 * real tool (and no database) ever runs.
 */

export const BENCH = "bench-press";
export const INCLINE = "incline-dumbbell-press";
export const SQUAT = "back-squat";
export const ROW = "barbell-row";
export const LEG_PRESS = "leg-press";

// uuids, as the show tools' inputs need
export const PLAN_ID = "d0000000-0000-4000-8000-000000000041";
const UPPER_WORKOUT_ID = "d0000000-0000-4000-8000-000000000042";
const LOWER_WORKOUT_ID = "d0000000-0000-4000-8000-000000000043";

/** The version marker the plan reads answer; the stale-save eval's next read moves it. */
export const PLAN_VERSION = "v1";
export const NEW_PLAN_VERSION = "v2";
export const BENCH_ROW_ID = "d0000000-0000-4000-8000-000000000051";
const ROW_ROW_ID = "d0000000-0000-4000-8000-000000000052";
const SQUAT_ROW_ID = "d0000000-0000-4000-8000-000000000053";

/** The latest finished Workout Session: Saturday's Lower Day. */
export const LAST_SESSION_ID = "d0000000-0000-4000-8000-000000000031";
const UPPER_SESSION_ID = "d0000000-0000-4000-8000-000000000032";

const set = (id: string, order: number, reps: number, weight: number) => ({
  id,
  order,
  reps_recommended: reps,
  rest_recommended: 90,
  weight_recommended: weight,
});

export const activePlan = {
  created_at: "2026-09-01T09:00:00+00:00",
  description: "Upper/lower split for size",
  experience_level: "intermediate",
  frequency: 2,
  goal: "muscle-gain",
  id: PLAN_ID,
  is_active: true,
  name: "Upper Lower Builder",
  note: null,
  place: "gym",
  updated_at: "2026-09-01T09:00:00+00:00",
  workout_duration: 60,
  workouts: [
    {
      description: "Chest, back and arms",
      exercises: [
        {
          exercise_slug: BENCH,
          id: BENCH_ROW_ID,
          muscle_groups: ["chest"],
          name: "Bench Press",
          exercise_note: null,
          order: 1,
          sets: [
            set("d0000000-0000-4000-8000-000000000061", 1, 8, 70),
            set("d0000000-0000-4000-8000-000000000062", 2, 8, 70),
          ],
        },
        {
          exercise_slug: ROW,
          id: ROW_ROW_ID,
          muscle_groups: ["back"],
          name: "Barbell Row",
          exercise_note: null,
          order: 2,
          sets: [set("d0000000-0000-4000-8000-000000000063", 1, 10, 60)],
        },
      ],
      id: UPPER_WORKOUT_ID,
      name: "Upper Day",
      order: 1,
    },
    {
      description: "Legs",
      exercises: [
        {
          exercise_slug: SQUAT,
          id: SQUAT_ROW_ID,
          muscle_groups: ["quadriceps"],
          name: "Back Squat",
          exercise_note: null,
          order: 1,
          sets: [set("d0000000-0000-4000-8000-000000000064", 1, 5, 100)],
        },
      ],
      id: LOWER_WORKOUT_ID,
      name: "Lower Day",
      order: 2,
    },
  ],
};

const loggedSet = (
  id: string,
  order: number,
  reps: number,
  weight: number
) => ({
  id,
  logged_at: "2026-10-09T18:20:00+00:00",
  note: null,
  order,
  reps_completed: reps,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_completed: weight,
  weight_recommended: 70,
});

/** Last week: one upper session on Thursday, one lower on Saturday. */
export const workoutHistory = [
  {
    exercises: [
      {
        exercise_slug: SQUAT,
        id: "wse-squat",
        muscle_groups: ["quadriceps"],
        name: "Back Squat",
        exercise_note: null,
        order: 1,
        sets: [
          loggedSet("d0000000-0000-4000-8000-000000000021", 1, 5, 105),
          loggedSet("d0000000-0000-4000-8000-000000000022", 2, 5, 105),
        ],
      },
    ],
    finished_at: "2026-10-11T10:55:00+00:00",
    id: LAST_SESSION_ID,
    plan: { id: activePlan.id, name: activePlan.name },
    started_at: "2026-10-11T10:00:00+00:00",
    status: "finished",
    workout: { id: LOWER_WORKOUT_ID, name: "Lower Day" },
  },
  {
    exercises: [
      {
        exercise_slug: BENCH,
        id: "wse-bench",
        muscle_groups: ["chest"],
        name: "Bench Press",
        exercise_note: null,
        order: 1,
        sets: [
          loggedSet("d0000000-0000-4000-8000-000000000023", 1, 8, 72.5),
          loggedSet("d0000000-0000-4000-8000-000000000024", 2, 7, 72.5),
        ],
      },
    ],
    finished_at: "2026-10-09T19:00:00+00:00",
    id: UPPER_SESSION_ID,
    plan: { id: activePlan.id, name: activePlan.name },
    started_at: "2026-10-09T18:00:00+00:00",
    status: "finished",
    workout: { id: UPPER_WORKOUT_ID, name: "Upper Day" },
  },
];

// uuids, as remove_set_from_workout_session's input needs
export const OPEN_LOGGED_SET = "d0000000-0000-4000-8000-000000000001";
export const OPEN_UNLOGGED_SET = "d0000000-0000-4000-8000-000000000003";

/** Open now: one Bench Press set logged, the next removed, one to go. */
export const openWorkoutSession = {
  exercises: [
    {
      exercise_slug: BENCH,
      id: "wse-open-bench",
      muscle_groups: ["chest"],
      name: "Bench Press",
      exercise_note: null,
      order: 1,
      sets: [
        {
          ...loggedSet(OPEN_LOGGED_SET, 1, 8, 70),
          logged_at: "2026-10-14T18:05:00+00:00",
        },
        {
          id: OPEN_UNLOGGED_SET,
          logged_at: null,
          note: null,
          order: 3,
          reps_completed: null,
          reps_recommended: 8,
          rest_recommended: 90,
          weight_completed: null,
          weight_recommended: 70,
        },
      ],
    },
  ],
  finished_at: null,
  id: "d0000000-0000-4000-8000-000000000033",
  plan: { id: activePlan.id, name: activePlan.name },
  started_at: "2026-10-14T18:00:00+00:00",
  status: "in_progress",
  workout: { id: UPPER_WORKOUT_ID, name: "Upper Day" },
};

export const chestExercises = [
  {
    difficulty: "intermediate",
    equipment: ["barbell", "bench"],
    exercise_slug: BENCH,
    movement_patterns: ["push"],
    muscle_groups: ["chest"],
    name: "Bench Press",
  },
  {
    difficulty: "beginner",
    equipment: ["dumbbell", "bench"],
    exercise_slug: INCLINE,
    movement_patterns: ["push"],
    muscle_groups: ["chest"],
    name: "Incline Dumbbell Press",
  },
];

/** `get_exercise_guide`'s answer for the Back Squat. */
const squatGuide = {
  common_mistakes: [
    "Letting the knees cave in",
    "Lifting the heels off the floor",
    "Rounding the lower back at the bottom",
  ],
  exercise_slug: SQUAT,
  name: "Back Squat",
  short_description:
    "A barbell squat with the bar across the upper back, training the quadriceps and glutes.",
  steps: [
    "Set the bar on your upper back and step back with feet shoulder-width apart.",
    "Brace your core and sit down between your hips, knees tracking over your toes.",
    "Descend until your thighs are at least parallel to the floor.",
    "Drive through your whole foot to stand back up.",
  ],
};

const libraryExercises = [
  ...chestExercises,
  {
    difficulty: "intermediate",
    equipment: ["barbell"],
    exercise_slug: SQUAT,
    movement_patterns: ["squat"],
    muscle_groups: ["quadriceps"],
    name: "Back Squat",
  },
  {
    difficulty: "beginner",
    equipment: ["machine"],
    exercise_slug: LEG_PRESS,
    movement_patterns: ["squat"],
    muscle_groups: ["quadriceps"],
    name: "Leg Press",
  },
  {
    difficulty: "intermediate",
    equipment: ["barbell"],
    exercise_slug: ROW,
    movement_patterns: ["pull"],
    muscle_groups: ["back"],
    name: "Barbell Row",
  },
];

/**
 * Every read tool and the plan card, stubbed; fallbacks last (the first
 * matching rule wins). The plan card checks slugs against the library and
 * reads the database, so it's stubbed too; evals check its input.
 */
export const readToolStubs: readonly ToolStub[] = [
  {
    id: "profile",
    outcome: {
      response: {
        age: 32,
        gender: "male",
        height: 180,
        measurement_system: "metric",
        units: { height: "cm", weight: "kg" },
        weight: 82,
      },
    },
    tool: "get_user_profile",
  },
  {
    id: "active-plan",
    outcome: { response: activePlan },
    tool: "get_active_plan",
  },
  {
    id: "plans",
    outcome: {
      response: [
        {
          ...activePlan,
          workouts: activePlan.workouts.map(
            ({ exercises, id, name, order }) => ({
              exercise_count: exercises.length,
              id,
              name,
              order,
            })
          ),
        },
      ],
    },
    tool: "get_plans",
  },
  {
    id: "history",
    outcome: { response: workoutHistory },
    tool: "get_workouts_history",
  },
  {
    id: "open-workout-session",
    outcome: { response: openWorkoutSession },
    tool: "get_open_workout_session",
  },
  {
    id: "chest-exercises",
    match: { muscle_group: { const: "chest" } },
    outcome: { response: chestExercises },
    tool: "search_exercises",
  },
  {
    id: "exercises",
    outcome: { response: libraryExercises },
    tool: "search_exercises",
  },
  {
    id: "squat-guide",
    match: { exercise_slug: { const: SQUAT } },
    outcome: { response: squatGuide },
    tool: "get_exercise_guide",
  },
  {
    id: "plan-card",
    outcome: { response: { shown: true } },
    tool: "display_workout_plan",
  },
  {
    id: "no-exercise-notes",
    outcome: { response: { notes: [] } },
    tool: "list_exercise_notes",
  },
];

/** The read tools and both set removals, so a removal is recorded, not run. */
export const removeSetStubs: readonly ToolStub[] = [
  ...readToolStubs,
  {
    id: "remove-session-set",
    outcome: { response: { success: true } },
    tool: "remove_set_from_workout_session",
  },
  {
    id: "remove-plan-set",
    outcome: { response: { success: true } },
    tool: "remove_set_from_exercise",
  },
];

/** An Exercise note as list_exercise_notes shows it. */
export const exerciseNote = (
  exercise_slug: string,
  name: string,
  note: string
) => ({
  exercise_slug,
  name,
  note,
  updated_at: "2026-11-20T18:00:00+00:00",
});

type ShownNote = ReturnType<typeof exerciseNote>;

/** Exercises as the read tools show them, each with its note from `notes`. */
const withNotes = <Shown extends { exercise_slug: string }>(
  exercises: readonly Shown[],
  notes: readonly ShownNote[]
) =>
  exercises.map((shown) => ({
    ...shown,
    exercise_note:
      notes.find(({ exercise_slug }) => exercise_slug === shown.exercise_slug)
        ?.note ?? null,
  }));

/**
 * The read tools, list_exercise_notes answering `notes` (and the active plan,
 * history and open workout session showing the same notes beside their
 * exercises), and the note write, so a write is recorded, not run. The plan
 * edits are stubbed too, so a note that reads like an instruction can't
 * change anything even if he followed it.
 */
export const noteStubs = (notes: readonly ShownNote[]): readonly ToolStub[] => [
  // Before readToolStubs' own answers: the first matching stub wins
  {
    id: "exercise-notes",
    outcome: { response: { notes } },
    tool: "list_exercise_notes",
  },
  {
    id: "active-plan-with-notes",
    outcome: {
      response: {
        ...activePlan,
        workouts: activePlan.workouts.map((workout) => ({
          ...workout,
          exercises: withNotes(workout.exercises, notes),
        })),
      },
    },
    tool: "get_active_plan",
  },
  {
    id: "history-with-notes",
    outcome: {
      response: workoutHistory.map((session) => ({
        ...session,
        exercises: withNotes(session.exercises, notes),
      })),
    },
    tool: "get_workouts_history",
  },
  {
    id: "open-workout-session-with-notes",
    outcome: {
      response: {
        ...openWorkoutSession,
        exercises: withNotes(openWorkoutSession.exercises, notes),
      },
    },
    tool: "get_open_workout_session",
  },
  ...removeSetStubs,
  {
    id: "set-exercise-note",
    outcome: { response: { success: true } },
    tool: "set_exercise_note",
  },
  ...[
    "add_exercise_to_workout",
    "remove_exercise_from_workout",
    "replace_exercise_in_workout",
    "update_set_recommendations",
    "add_set_to_exercise",
    "activate_plan",
    "update_user_profile",
  ].map((tool) => ({
    id: `stub-${tool}`,
    outcome: { response: { success: true } },
    tool,
  })),
];

// uuids, as set_workout_session_set_note's input needs
const NOTE_FIRST_SET = "d0000000-0000-4000-8000-000000000011";
export const NOTE_LAST_SET = "d0000000-0000-4000-8000-000000000012";
const NOTE_UNLOGGED_SET = "d0000000-0000-4000-8000-000000000013";
const NOTE_INCLINE_SET = "d0000000-0000-4000-8000-000000000014";

/**
 * Open now: two Bench Press sets logged, the second one last of all, one to
 * go, then one Incline Dumbbell Press set logged between them.
 */
const setNoteSession = {
  ...openWorkoutSession,
  exercises: [
    {
      ...openWorkoutSession.exercises[0],
      sets: [
        {
          ...loggedSet(NOTE_FIRST_SET, 1, 8, 70),
          logged_at: "2026-10-14T18:05:00+00:00",
        },
        {
          ...loggedSet(NOTE_LAST_SET, 2, 6, 75),
          logged_at: "2026-10-14T18:20:00+00:00",
        },
        {
          id: NOTE_UNLOGGED_SET,
          logged_at: null,
          note: null,
          order: 3,
          reps_completed: null,
          reps_recommended: 8,
          rest_recommended: 90,
          weight_completed: null,
          weight_recommended: 75,
        },
      ],
    },
    {
      // Later in the Workout but logged earlier, so the last set by position
      // isn't the one logged most recently
      exercise_slug: INCLINE,
      id: "wse-open-incline",
      muscle_groups: ["chest"],
      name: "Incline Dumbbell Press",
      exercise_note: null,
      order: 2,
      sets: [
        {
          ...loggedSet(NOTE_INCLINE_SET, 1, 10, 24),
          logged_at: "2026-10-14T18:12:00+00:00",
        },
      ],
    },
  ],
};

/**
 * The note stubs, with the open Workout Session holding two logged sets and
 * the set note write recorded, not run.
 */
export const setNoteStubs: readonly ToolStub[] = [
  // Before readToolStubs' open session: the first matching stub wins
  {
    id: "set-note-session",
    outcome: { response: setNoteSession },
    tool: "get_open_workout_session",
  },
  ...noteStubs([]),
  {
    id: "set-session-set-note",
    outcome: { response: { success: true } },
    tool: "set_workout_session_set_note",
  },
];

/**
 * The client context of a build that can draw every reference and snapshot
 * card (ADR 0027), so Arnold is offered the eight show tools. Not
 * `plan_proposal`, so the Plan edits and the old plan card stay offered
 * (`proposalBuild` is the build with it). A session sent no `cards` is an
 * old build, which is offered none of them.
 */
export const cardBuild = {
  cards: arnoldCardIds.filter((card) => card !== "plan_proposal"),
  language: "en",
  timeZone: "Europe/Kyiv",
} as const;

/** An old build's client context: no `cards`, so no show tool. */
export const oldBuild = { language: "en" } as const;

/** `get_exercise_history`'s answer for the Bench Press. */
const benchHistory = {
  best_result: { reps: 8, weight: 72.5 },
  entries: workoutHistory.flatMap(
    ({ exercises, finished_at, id, started_at }) =>
      exercises.flatMap((exercise) =>
        exercise.exercise_slug === BENCH
          ? [
              {
                id: exercise.id,
                session: { finished_at, id, started_at },
                sets: exercise.sets,
              },
            ]
          : []
      )
  ),
  exercise_slug: BENCH,
  name: "Bench Press",
  total: 1,
  weight_unit: "kg",
};

/**
 * `get_weekly_goal`'s answer on Wednesday 2026-10-14 in Kyiv: two Workouts a
 * week, none yet this week, last week's two (the history's) hitting it, and
 * numbers no other fixture has, so a reply quoting them took them from here.
 */
export const weeklyGoal = {
  goal: 2,
  streak: 5,
  this_week: { count: 0, goal: 2, hit: false },
  time_zone: "Europe/Kyiv",
  weeks: [
    ["2026-08-23T21:00:00.000Z", 2],
    ["2026-08-30T21:00:00.000Z", 1],
    ["2026-09-06T21:00:00.000Z", 3],
    ["2026-09-13T21:00:00.000Z", 2],
    ["2026-09-20T21:00:00.000Z", 2],
    ["2026-09-27T21:00:00.000Z", 3],
    ["2026-10-04T21:00:00.000Z", 2],
    ["2026-10-11T21:00:00.000Z", 0],
  ].map(([start, count], index, weeks) => ({
    count,
    current: index === weeks.length - 1,
    goal: 2,
    hit: Number(count) >= 2,
    kind: "tracked",
    start,
  })),
  weeks_hit: { eligible: 7, hit: 6 },
};

/** `get_lifetime_totals`' answer. */
export const lifetimeTotals = {
  duration_seconds: 171_000,
  volume: 152_340,
  weight_unit: "kg",
  workout_count: 47,
};

/**
 * Every read tool, the three reads behind the snapshot cards, and the eight
 * show tools, each show tool answering as the real one does (ids only, or
 * the read's numbers), so a card is recorded, not drawn. Only a session sent
 * `cardBuild` is offered the show tools.
 */
export const cardStubs: readonly ToolStub[] = [
  ...readToolStubs,
  {
    id: "plan",
    outcome: { response: { ...activePlan, plan_version: PLAN_VERSION } },
    tool: "get_plan",
  },
  {
    id: "bench-history",
    match: { exercise_slug: { const: BENCH } },
    outcome: { response: benchHistory },
    tool: "get_exercise_history",
  },
  {
    id: "weekly-goal",
    outcome: { response: weeklyGoal },
    tool: "get_weekly_goal",
  },
  {
    id: "lifetime-totals",
    outcome: { response: lifetimeTotals },
    tool: "get_lifetime_totals",
  },
  {
    id: "show-exercises",
    outcome: { response: { exercise_slugs: [BENCH] } },
    tool: "show_exercises",
  },
  {
    id: "show-workout",
    outcome: { response: { plan_id: PLAN_ID, workout_id: UPPER_WORKOUT_ID } },
    tool: "show_workout",
  },
  {
    id: "show-plan",
    outcome: { response: { plan_id: PLAN_ID } },
    tool: "show_plan",
  },
  {
    id: "show-workout-session",
    outcome: { response: { workout_session_id: LAST_SESSION_ID } },
    tool: "show_workout_session",
  },
  {
    id: "show-profile",
    outcome: { response: {} },
    tool: "show_profile",
  },
  {
    id: "show-bench-history",
    outcome: { response: benchHistory },
    tool: "show_exercise_history",
  },
  {
    id: "show-weekly-goal",
    outcome: { response: weeklyGoal },
    tool: "show_weekly_goal",
  },
  {
    id: "show-lifetime-totals",
    outcome: { response: lifetimeTotals },
    tool: "show_lifetime_totals",
  },
];

/** The eight show tools, for an old build's evals to check none was called. */
export const showTools = arnoldCards.flatMap(({ id, tool }) =>
  id === "plan_proposal" ? [] : [tool]
);

/** A reply that is there and at most `max` characters: a card's short answer. */
export const isShortAnswer =
  (max: number) =>
  (reply?: string): boolean =>
    reply !== undefined && reply.trim().length > 0 && reply.length <= max;

/** A reply that never mentions a card, for an old build. */
export const mentionsNoCard = (reply?: string): boolean =>
  !/\bcards?\b/iu.test(reply ?? "");

/**
 * Gate for a judged numbers check: a boolean judgment is a probability, so a
 * reply quoting the read gets a high one and a reply with an invented or
 * wrong number a low one; 0.6 sits between them with room for the judge.
 */
export const NUMBERS_GATE = 0.6;

/**
 * Asks the judge whether every number a reply gives about the user's
 * training is in `data`, the read tool's answer: judged, since the same
 * numbers can be written many ways ("5 weeks in a row", "a five-week streak").
 * Beside a card a reply may give none (the card shows them), so only a text
 * answer is held to giving some (`{ required: true }`).
 */
export const numbersFrom = (
  data: unknown,
  { required }: { required: boolean }
) =>
  `Every number the response gives about the user's training (counts of workouts, weeks, a streak, a goal, weights, reps, durations, totals) agrees with this data the app read for the user: ${JSON.stringify(data)}. Saying "this week", "last week" or naming a weekday or a date is not a number. A number that isn't in the data, or that contradicts it, fails. ${required ? "A response that gives no number at all fails." : "A response that gives no number at all passes."}`;

/**
 * The client context of a build that draws every card, the Plan Proposal
 * included (ADR 0027): Arnold is offered propose_plan, and neither the Plan
 * edits nor the old plan card.
 */
export const proposalBuild = {
  cards: [...arnoldCardIds],
  language: "en",
  timeZone: "Europe/Kyiv",
} as const;

/** The library's names of the exercises the fixtures search answers. */
const exerciseNames = {
  [INCLINE]: "Incline Dumbbell Press",
  [LEG_PRESS]: "Leg Press",
  [ROW]: "Barbell Row",
  [SQUAT]: "Back Squat",
} as const;

/** What propose_plan answers once the User accepted and the save landed. */
const savedProposal = {
  changes: {
    exercises_added: 0,
    exercises_removed: 0,
    sets_added: 1,
    sets_changed: 0,
    sets_removed: 0,
    workouts_added: 0,
    workouts_changed: 1,
    workouts_removed: 0,
  },
  plan_id: PLAN_ID,
};

/**
 * The card stubs, an Exercise history with no entries for every exercise the
 * searches answer but the Bench Press (whose history is `cardStubs`'), and
 * propose_plan answering a landed save. propose_plan's approval still holds
 * each call for the eval to answer (`requireInteraction`, `respond`), so a
 * stub runs only on Accept.
 */
export const proposalStubs: readonly ToolStub[] = [
  {
    id: "active-plan-with-version",
    outcome: { response: { ...activePlan, plan_version: PLAN_VERSION } },
    tool: "get_active_plan",
  },
  ...cardStubs,
  ...Object.entries(exerciseNames).map(([slug, name]): ToolStub => ({
    id: `no-history-${slug}`,
    match: { exercise_slug: { const: slug } },
    outcome: {
      response: {
        best_result: null,
        entries: [],
        exercise_slug: slug,
        name,
        total: 0,
        weight_unit: "kg",
      },
    },
    tool: "get_exercise_history",
  })),
  {
    id: "save-proposal",
    outcome: { response: savedProposal },
    tool: "propose_plan",
  },
];

/** propose_plan's refusal on Accept when the Plan moved on: `PLAN_CHANGED`'s text. */
const PLAN_CHANGED_MESSAGE =
  "The plan changed since you read it (the user trained, edited it or took a plan update), so nothing was saved. Read it again with get_plan and propose the change afresh from what it is now.";

/**
 * The proposal stubs where the first accepted save is refused because the
 * Plan changed, and the Plan reads at a new marker after the first read:
 * first matching rule wins, so these go before `proposalStubs`'. This is
 * the save's own refusal (a change between eve's recheck and the save); the
 * recheck's denial carries the same text, but a stubbed eval can't reach it.
 */
export const staleSaveStubs: readonly ToolStub[] = [
  // The active Plan reads at the old marker first; any read after it, by
  // either tool, at the new one (a first read by get_plan is already new)
  {
    id: "active-plan-moves-on",
    outcomes: [
      { response: { ...activePlan, plan_version: PLAN_VERSION } },
      { response: { ...activePlan, plan_version: NEW_PLAN_VERSION } },
    ],
    tool: "get_active_plan",
  },
  {
    id: "plan-moved-on",
    outcome: { response: { ...activePlan, plan_version: NEW_PLAN_VERSION } },
    tool: "get_plan",
  },
  {
    id: "refused-then-saved",
    outcomes: [
      { throw: { message: PLAN_CHANGED_MESSAGE } },
      { response: savedProposal },
    ],
    tool: "propose_plan",
  },
  ...proposalStubs,
];

/** Tool names in call order, a plan read coming before the last proposal. */
export const readsBeforeProposing = (names: readonly string[]): boolean => {
  const proposal = names.lastIndexOf("propose_plan");

  return (
    proposal > 0 &&
    names
      .slice(0, proposal)
      .some((name) => name === "get_plan" || name === "get_active_plan")
  );
};

interface TurnEvents {
  readonly events: readonly {
    readonly data?: unknown;
    readonly type: string;
  }[];
}

/** A finished text part, as `content.completed` carries it. */
const completedText = z.object({ kind: z.literal("text"), value: z.string() });

/**
 * Everything Arnold wrote in a turn, narration included: a turn that parks
 * on a proposal ends with no reply, and what he says beside the call is
 * narration, which the app shows above the card.
 */
export const turnText = ({ events }: TurnEvents): string =>
  events
    .flatMap(({ data, type }) => {
      const text = completedText.safeParse(data);

      return type === "content.completed" && text.success
        ? [text.data.value]
        : [];
    })
    .join("\n\n");
