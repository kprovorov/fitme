import type { ToolStub } from "eve/evals";

/**
 * What the Coach's read tools return for a made-up User, shaped like the
 * services' output. Every eval session stubs the tools it may call, so no
 * real tool (and no database) ever runs.
 */

export const BENCH_ID = "0b8f8a52-6a4e-4d47-9a43-2f1f5a1c0001";
export const INCLINE_ID = "0b8f8a52-6a4e-4d47-9a43-2f1f5a1c0002";
export const SQUAT_ID = "0b8f8a52-6a4e-4d47-9a43-2f1f5a1c0003";
export const ROW_ID = "0b8f8a52-6a4e-4d47-9a43-2f1f5a1c0004";

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
          exercise: {
            id: BENCH_ID,
            muscle_groups: ["chest"],
            name: "Bench Press",
          },
          id: "we-bench",
          order: 1,
          sets: [set("s-bench-1", 1, 8, 70), set("s-bench-2", 2, 8, 70)],
        },
        {
          exercise: {
            id: ROW_ID,
            muscle_groups: ["back"],
            name: "Barbell Row",
          },
          id: "we-row",
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
          exercise: {
            id: SQUAT_ID,
            muscle_groups: ["quadriceps"],
            name: "Back Squat",
          },
          id: "we-squat",
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
        exercise: { id: SQUAT_ID, name: "Back Squat" },
        id: "wse-squat",
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
        exercise: { id: BENCH_ID, name: "Bench Press" },
        id: "wse-bench",
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

export const chestExercises = [
  { id: BENCH_ID, muscle_groups: ["chest"], name: "Bench Press" },
  { id: INCLINE_ID, muscle_groups: ["chest"], name: "Incline Dumbbell Press" },
];

const libraryExercises = [
  ...chestExercises,
  { id: SQUAT_ID, muscle_groups: ["quadriceps"], name: "Back Squat" },
  { id: ROW_ID, muscle_groups: ["back"], name: "Barbell Row" },
];

/** Every read tool, stubbed; fallbacks last (the first matching rule wins). */
export const readToolStubs = [
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
] satisfies readonly ToolStub[];
