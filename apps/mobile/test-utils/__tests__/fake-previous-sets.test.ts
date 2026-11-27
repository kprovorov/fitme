/**
 * The fake Public API's Previous sets (`GLOSSARY.md`, ADR 0025) on
 * `GET /v1/workout-sessions/{id}`, `POST /v1/workout-sessions` and
 * `POST /v1/workout-sessions/{id}/finish`, through the real client: each
 * Exercise's positive-rep sets, numbered by position, of its first appearance
 * in the User's most recent earlier-started Workout Session that has one with
 * a positive-rep set, in any Plan or Workout, never the session itself.
 */
import { beforeEach, describe, expect, it } from "@jest/globals";

import { publicApi } from "~/lib/public-api";
import { backend } from "~/test-utils/fake-public-api";
import type { SeedSession } from "~/test-utils/fake-public-api";

const DAY_1 = "2026-10-01T10:00:00.000Z";
const DAY_2 = "2026-10-02T10:00:00.000Z";
const DAY_3 = "2026-10-03T10:00:00.000Z";

beforeEach(() => {
  backend.reset();
});

const seed = (session: SeedSession) =>
  backend.seed({ finished: true, ...session });

/** Gives each set of a seeded Exercise its logged weight, by position. */
const weigh = (exerciseId: string, weights: (number | null)[]) => {
  for (const [index, weight] of weights.entries()) {
    const set = backend.sets.find(
      ({ id }) => id === `${exerciseId}-s${index + 1}`
    );

    if (set) {
      set.weight_completed = weight;
    }
  }
};

/** Each Exercise's Previous sets, as the Workout Session's read answers them. */
const previousOf = async (sessionId: string) => {
  const { data } = await publicApi().GET("/v1/workout-sessions/{id}", {
    params: { path: { id: sessionId } },
  });

  return data?.data.exercises.map(({ exercise_slug, previous_sets }) => [
    exercise_slug,
    previous_sets,
  ]);
};

describe("the fake's Previous sets", () => {
  it("answers none the first time", async () => {
    seed({ exercises: [{ name: "Squat", sets: [10, 8] }], id: "today" });

    await expect(previousOf("today")).resolves.toEqual([["squat", []]]);
  });

  it("matches by number, leaves a 0-rep or unlogged set out and answers weights as stored", async () => {
    seed({
      exercises: [{ name: "Squat", sets: [10, 0, null, 6] }],
      id: "last",
      startedAt: DAY_1,
    });
    weigh("last-e1", [60, 70, 70, null]);
    seed({ exercises: [{ name: "Squat", sets: [null] }], id: "today" });

    await expect(previousOf("today")).resolves.toEqual([
      [
        "squat",
        [
          { number: 1, reps_completed: 10, weight_completed: 60 },
          { number: 4, reps_completed: 6, weight_completed: null },
        ],
      ],
    ]);
  });

  it("takes the most recent earlier session, in any Plan or Workout", async () => {
    seed({
      exercises: [{ name: "Squat", sets: [5] }],
      id: "older",
      startedAt: DAY_1,
    });
    seed({
      exercises: [{ name: "Squat", sets: [7] }],
      id: "newer",
      planId: "plan-2",
      startedAt: DAY_2,
      workoutId: "another-workout",
    });
    seed({ exercises: [{ name: "Squat", sets: [null] }], id: "today" });

    await expect(previousOf("today")).resolves.toEqual([
      ["squat", [{ number: 1, reps_completed: 7, weight_completed: null }]],
    ]);
  });

  it("skips a session whose sets of the Exercise all have 0 reps", async () => {
    seed({
      exercises: [{ name: "Squat", sets: [5] }],
      id: "real",
      startedAt: DAY_1,
    });
    seed({
      exercises: [
        { name: "Squat", sets: [0, null] },
        { name: "Bench Press", sets: [8] },
      ],
      id: "skipped",
      startedAt: DAY_2,
    });
    seed({ exercises: [{ name: "Squat", sets: [null] }], id: "today" });

    await expect(previousOf("today")).resolves.toEqual([
      ["squat", [{ number: 1, reps_completed: 5, weight_completed: null }]],
    ]);
  });

  it("takes an earlier session's first appearance, and today's never counts itself", async () => {
    seed({
      exercises: [
        { name: "Squat", sets: [5] },
        { name: "Squat", sets: [3] },
      ],
      id: "last",
      startedAt: DAY_1,
    });
    seed({
      exercises: [
        { name: "Squat", sets: [12] },
        { name: "Squat", sets: [null] },
      ],
      id: "today",
    });

    const previous = [{ number: 1, reps_completed: 5, weight_completed: null }];

    await expect(previousOf("today")).resolves.toEqual([
      ["squat", previous],
      ["squat", previous],
    ]);
  });

  it("breaks a tie on the start by id", async () => {
    seed({
      exercises: [{ name: "Squat", sets: [5] }],
      id: "a",
      startedAt: DAY_1,
    });
    seed({
      exercises: [{ name: "Squat", sets: [6] }],
      id: "b",
      startedAt: DAY_1,
    });

    await expect(previousOf("b")).resolves.toEqual([
      ["squat", [{ number: 1, reps_completed: 5, weight_completed: null }]],
    ]);
    await expect(previousOf("a")).resolves.toEqual([["squat", []]]);
  });

  it("looks only at sessions that started before a finished one", async () => {
    seed({
      exercises: [{ name: "Squat", sets: [5] }],
      id: "before",
      startedAt: DAY_1,
    });
    seed({
      exercises: [{ name: "Squat", sets: [8] }],
      id: "finished",
      startedAt: DAY_2,
    });
    seed({
      exercises: [{ name: "Squat", sets: [9] }],
      id: "after",
      startedAt: DAY_3,
    });

    await expect(previousOf("finished")).resolves.toEqual([
      ["squat", [{ number: 1, reps_completed: 5, weight_completed: null }]],
    ]);
  });

  it("never counts another User's rows", async () => {
    seed({
      exercises: [{ name: "Squat", sets: [5] }],
      id: "mine",
      startedAt: DAY_1,
    });
    seed({
      exercises: [{ name: "Squat", sets: [20] }],
      id: "theirs",
      startedAt: DAY_2,
      userId: "user_other",
    });
    seed({ exercises: [{ name: "Squat", sets: [null] }], id: "today" });

    await expect(previousOf("today")).resolves.toEqual([
      ["squat", [{ number: 1, reps_completed: 5, weight_completed: null }]],
    ]);
  });

  it("counts only the first 100 sets by position", async () => {
    seed({
      exercises: [
        { name: "Squat", sets: Array.from({ length: 101 }, () => 1) },
      ],
      id: "last",
      startedAt: DAY_1,
    });
    seed({ exercises: [{ name: "Squat", sets: [null] }], id: "today" });

    const [[, previous] = []] = (await previousOf("today")) ?? [];

    expect(previous).toHaveLength(100);
  });

  it("answers them on a start and a finish too", async () => {
    backend.seedPlan({
      id: "plan-1",
      name: "Strength",
      workouts: [
        { exercises: [{ sets: 2, slug: "squat" }], id: "w1", name: "Legs" },
      ],
    });
    seed({
      exercises: [{ name: "Squat", sets: [5, 4] }],
      id: "last",
      startedAt: DAY_1,
    });
    weigh("last-e1", [80, 82.5]);

    const previous = [
      { number: 1, reps_completed: 5, weight_completed: 80 },
      { number: 2, reps_completed: 4, weight_completed: 82.5 },
    ];

    const started = await publicApi().POST("/v1/workout-sessions", {
      body: { workout_id: "w1" },
    });

    expect(started.response.status).toBe(201);
    expect(started.data?.data.exercises[0]?.previous_sets).toEqual(previous);

    const sessionId = started.data?.data.id ?? "";

    const finished = await publicApi().POST(
      "/v1/workout-sessions/{id}/finish",
      { params: { path: { id: sessionId } } }
    );

    expect(finished.data?.data.exercises[0]?.previous_sets).toEqual(previous);
  });
});
