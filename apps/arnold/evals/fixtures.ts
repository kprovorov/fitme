import type { ToolStub } from "eve/evals";

/**
 * What Arnold's read tools return for a made-up User, shaped like the
 * tools' output (Exercises by exercise_slug, named from the library). Every eval session stubs the tools it may call, so no
 * real tool (and no database) ever runs.
 */

export const BENCH = "bench-press";
export const INCLINE = "incline-dumbbell-press";
export const SQUAT = "back-squat";
export const ROW = "barbell-row";

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
  id: "plan-upper-lower",
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
          id: "we-bench",
          muscle_groups: ["chest"],
          name: "Bench Press",
          order: 1,
          sets: [set("s-bench-1", 1, 8, 70), set("s-bench-2", 2, 8, 70)],
        },
        {
          exercise_slug: ROW,
          id: "we-row",
          muscle_groups: ["back"],
          name: "Barbell Row",
          order: 2,
          sets: [set("s-row-1", 1, 10, 60)],
        },
      ],
      id: "workout-upper",
      name: "Upper Day",
      order: 1,
    },
    {
      description: "Legs",
      exercises: [
        {
          exercise_slug: SQUAT,
          id: "we-squat",
          muscle_groups: ["quadriceps"],
          name: "Back Squat",
          order: 1,
          sets: [set("s-squat-1", 1, 5, 100)],
        },
      ],
      id: "workout-lower",
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
        order: 1,
        sets: [
          loggedSet("ls-squat-1", 1, 5, 105),
          loggedSet("ls-squat-2", 2, 5, 105),
        ],
      },
    ],
    finished_at: "2026-10-11T10:55:00+00:00",
    id: "session-lower",
    plan: { id: activePlan.id, name: activePlan.name },
    started_at: "2026-10-11T10:00:00+00:00",
    status: "finished",
    workout: { id: "workout-lower", name: "Lower Day" },
  },
  {
    exercises: [
      {
        exercise_slug: BENCH,
        id: "wse-bench",
        muscle_groups: ["chest"],
        name: "Bench Press",
        order: 1,
        sets: [
          loggedSet("ls-bench-1", 1, 8, 72.5),
          loggedSet("ls-bench-2", 2, 7, 72.5),
        ],
      },
    ],
    finished_at: "2026-10-09T19:00:00+00:00",
    id: "session-upper",
    plan: { id: activePlan.id, name: activePlan.name },
    started_at: "2026-10-09T18:00:00+00:00",
    status: "finished",
    workout: { id: "workout-upper", name: "Upper Day" },
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
      order: 1,
      sets: [
        {
          ...loggedSet(OPEN_LOGGED_SET, 1, 8, 70),
          logged_at: "2026-10-14T18:05:00+00:00",
        },
        {
          id: OPEN_UNLOGGED_SET,
          logged_at: null,
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
  id: "session-open",
  plan: { id: activePlan.id, name: activePlan.name },
  started_at: "2026-10-14T18:00:00+00:00",
  status: "in_progress",
  workout: { id: "workout-upper", name: "Upper Day" },
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

/**
 * The read tools, list_exercise_notes answering `notes`, and the note write,
 * so a write is recorded, not run. The plan edits are stubbed too, so a note
 * that reads like an instruction can't change anything even if he followed it.
 */
export const noteStubs = (
  notes: readonly ReturnType<typeof exerciseNote>[]
): readonly ToolStub[] => [
  ...removeSetStubs,
  {
    id: "exercise-notes",
    outcome: { response: { notes } },
    tool: "list_exercise_notes",
  },
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
