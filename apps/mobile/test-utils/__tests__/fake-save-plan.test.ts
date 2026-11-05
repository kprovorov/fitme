import { ApiError } from "@fitme/api-client";
/**
 * The fake Public API's `PUT /v1/plans/{id}`, through the real client, as the
 * Plan builder's edit saves will reach it: the services' semantics (ADR 0016)
 * over its in-memory rows.
 */
import { beforeEach, describe, expect, it } from "@jest/globals";
import { it, describe, expect, beforeEach } from "vitest";

import { publicApi } from "~/lib/public-api";
import { libraryExercise, serveLibrary } from "~/test-utils/fake-library";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";

const COVER = "5b1e7c2a-8d4f-4a6b-9c3e-1f2a3b4c5d6e";

const set = (weight: number) => ({
  reps_recommended: 8,
  rest_recommended: 90,
  weight_recommended: weight,
});

const details = {
  experience_level: "beginner",
  frequency: 4,
  goal: "muscle-gain",
  name: "Edited",
  place: "home",
  workout_duration: 45,
} as const;

beforeEach(() => {
  serveLibrary([libraryExercise("squat"), libraryExercise("bench-press")]);
  backend.seedPlan({
    id: "plan-1",
    is_active: true,
    name: "Full body",
    workouts: [
      {
        cover: COVER,
        exercises: [
          { sets: [set(60), set(65)], slug: "squat" },
          { sets: 1, slug: "bench-press" },
        ],
        id: "workout-a",
        name: "Day A",
      },
      {
        exercises: [{ sets: 1, slug: "squat" }],
        id: "workout-b",
        name: "Day B",
      },
    ],
  });
});

const save = (body: object, id = "plan-1") =>
  publicApi().PUT("/v1/plans/{id}", {
    body: body as never,
    params: { path: { id } },
  });

describe("the fake's PUT /v1/plans/{id}", () => {
  it("keeps the rows sent with their ids, creates the rest, drops the ones left out, and answers the Plan in full", async () => {
    const { data: answer } = await save({
      ...details,
      workouts: [
        {
          exercises: [
            {
              exercise_slug: "squat",
              id: "workout-a-e1",
              sets: [{ ...set(70), id: "workout-a-e1-s2" }, set(75)],
            },
          ],
          id: "workout-a",
          name: "Legs",
        },
        {
          exercises: [{ exercise_slug: "bench-press", sets: [set(40)] }],
          name: "Day C",
        },
      ],
    });

    const data = answer?.data;

    if (!data) {
      throw new Error("The save answered no Plan");
    }

    expect(data).toMatchObject({
      ...details,
      description: null,
      id: "plan-1",
      is_active: true,
    });
    const [legs, dayC] = data.workouts;
    expect(legs).toMatchObject({ cover: COVER, id: "workout-a", name: "Legs" });
    expect(legs.exercises).toHaveLength(1);
    expect(
      legs.exercises[0].sets.map((s) => [s.id, s.weight_recommended])
    ).toEqual([
      ["workout-a-e1-s2", 70],
      [expect.any(String), 75],
    ]);
    expect(dayC).toMatchObject({ cover: null, name: "Day C", order: 2 });
    expect(data.workouts.map((w) => w.id)).not.toContain("workout-b");

    const read = await publicApi().GET("/v1/plans/{id}", {
      params: { path: { id: "plan-1" } },
    });

    expect(read.data).toEqual(answer);
    expect(fakePublicApi.count("PUT /v1/plans/{id}")).toBe(1);
  });

  it.each([
    ["an id under another parent", "workout-b-e1"],
    ["an id that isn't the Plan's", "workout-z-e1"],
  ])("answers 400 invalid_request for %s, changing nothing", async (_, id) => {
    const before = backend.nestedPlan(backend.plans[0]);

    const failure = await save({
      ...details,
      workouts: [
        {
          exercises: [{ exercise_slug: "squat", id, sets: [set(60)] }],
          id: "workout-a",
          name: "Day A",
        },
      ],
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(400);
    expect((failure as ApiError).code).toBe("invalid_request");
    expect(backend.nestedPlan(backend.plans[0])).toEqual(before);
  });

  it("answers 400 unknown_exercises and 404 not_found as the API does", async () => {
    const unknown = await save({
      ...details,
      workouts: [
        {
          exercises: [{ exercise_slug: "made-up", sets: [set(1)] }],
          name: "X",
        },
      ],
    }).catch((error: unknown) => error);

    const missing = await save(
      {
        ...details,
        workouts: [
          {
            exercises: [{ exercise_slug: "squat", sets: [set(1)] }],
            name: "X",
          },
        ],
      },
      "plan-404"
    ).catch((error: unknown) => error);

    expect((unknown as ApiError).code).toBe("unknown_exercises");
    expect((missing as ApiError).status).toBe(404);
  });
});
