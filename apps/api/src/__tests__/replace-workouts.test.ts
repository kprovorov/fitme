import { ExerciseLibraryUnavailableError } from "@fitme/exercise-library";
import type { PlanWorkoutInput } from "@fitme/services/plans";
import { describe, expect, it } from "vitest";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const planId = "6f0c1d7e-3b1a-4d7e-9a43-2f6b0c1e5a10";

/** A field of the services' answer the contract never shows. */
const LEGACY_OR_INTERNAL_FIELD =
  /"(exercise_id|exercise|deleted_at|request_key|user_id)"/;

/** A valid body: two Workouts over the Exercises the test library knows. */
const body = () => ({
  workouts: [
    {
      description: "Squats",
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          sets: [
            {
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 80.5,
            },
          ],
        },
      ],
      name: "Day C",
    },
    {
      description: "Deadlifts",
      exercises: [
        {
          exercise_slug: "barbell-deadlift",
          sets: [
            {
              reps_recommended: 5,
              rest_recommended: 180,
              weight_recommended: 0,
            },
          ],
        },
      ],
      name: "Day D",
    },
  ],
});

/** The Plan after the replacement, as the contract shows it, without its `weight_unit`. */
const replaced = {
  created_at: "2026-10-20T09:00:00+00:00",
  description: "Three full-body days",
  experience_level: "intermediate",
  frequency: 3,
  goal: "muscle-gain",
  id: planId,
  is_active: false,
  name: "Full body",
  note: null,
  place: "gym",
  updated_at: "2026-10-24T09:00:00+00:00",
  workout_duration: 60,
  workouts: [
    {
      description: "Squats",
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          id: "c3f8e2d4-9a51-4b2c-9e3f-5d7a9c1e3f40",
          order: 1,
          sets: [
            {
              id: "d4a9f3e5-0b62-4c3d-8f4a-6e8b0d2f4a50",
              order: 1,
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 80.5,
            },
          ],
        },
      ],
      id: "a1d6c0b2-7e3f-4f0a-9c1d-3b5e7a9c1d20",
      name: "Day C",
      order: 1,
    },
  ],
};

/** `replaced` as the services return it: with their internal fields. */
const servicesReplaced = {
  ...replaced,
  deleted_at: null,
  user_id: "user_alice",
  workouts: replaced.workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      request_key: null,
    })),
  })),
};

/**
 * Services whose `replaceWorkouts` records what it was asked and answers
 * `servicesReplaced`, or `null` (no such Plan for the User) with `found: false`.
 */
const recordingServices = ({
  found = true,
  weightUnit = "kg",
}: {
  found?: boolean;
  weightUnit?: "kg" | "lbs";
} = {}) => {
  const calls: { planId: string; workouts: PlanWorkoutInput[] }[] = [];
  const services = fakeServices({
    replaceWorkouts: (id, workouts) => {
      calls.push({ planId: id, workouts });
      return Promise.resolve(
        found ? { value: servicesReplaced, weightUnit } : null
      );
    },
  });
  return { calls, services };
};

const put = (
  app: ReturnType<typeof testApp>["app"],
  payload: unknown,
  {
    headers = signedInAs("user_alice"),
    id = planId,
  }: { headers?: Record<string, string>; id?: string } = {}
) =>
  app.request(`/v1/plans/${id}/workouts`, {
    body: JSON.stringify(payload),
    headers: { ...headers, "content-type": "application/json" },
    method: "PUT",
  });

describe("PUT /v1/plans/{id}/workouts", () => {
  it("replaces the Plan's Workouts with the sent ones and answers the Plan in full with its weight unit", async () => {
    const { calls, services } = recordingServices();
    const { app, reported, servicesFor } = testApp({ services });

    const response = await put(app, body());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { ...replaced, weight_unit: "kg" },
    });
    expect(calls).toEqual([{ planId, workouts: body().workouts }]);
    expect(servicesFor).toEqual(["user_alice"]);
    expect(reported).toEqual([]);
  });

  it("answers the weight unit of the User's Profile", async () => {
    const { services } = recordingServices({ weightUnit: "lbs" });
    const { app } = testApp({ services });

    const response = await put(app, body());

    expect((await response.json()).data.weight_unit).toBe("lbs");
  });

  it("answers 404 not_found when the User has no such live Plan, unreported", async () => {
    const { services } = recordingServices({ found: false });
    const { app, reported } = testApp({ services });

    const response = await put(app, body());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Plan not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 unknown_exercises naming each unknown slug once, writes nothing, unreported", async () => {
    // replaceWorkouts isn't faked: calling it would fail the request with a 500
    const { app, reported } = testApp({ services: fakeServices({}) });
    const payload = body();
    payload.workouts[0].exercises[0].exercise_slug = "made-up-press";
    payload.workouts[1].exercises.push(
      {
        exercise_slug: "made-up-press",
        sets: [
          { reps_recommended: 5, rest_recommended: 60, weight_recommended: 0 },
        ],
      },
      {
        exercise_slug: "made-up-row",
        sets: [
          { reps_recommended: 5, rest_recommended: 60, weight_recommended: 0 },
        ],
      }
    );

    const response = await put(app, payload);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "unknown_exercises",
        message: "Unknown exercise_slug(s): made-up-press, made-up-row",
      },
    });
    expect(reported).toEqual([]);
  });

  it("answers a reported 503 exercise_library_unavailable when the Exercise Library fails, writing nothing", async () => {
    const { app, library, reported } = testApp({ services: fakeServices({}) });
    const outage = new ExerciseLibraryUnavailableError();
    library.failWith(outage);

    const response = await put(app, body());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "exercise_library_unavailable",
        message:
          "The Exercise Library is unavailable, so the Exercises couldn't be checked; try again",
      },
    });
    expect(reported).toEqual([outage]);
  });

  it("answers a reported 503 exercise_library_unavailable when the Exercise Library isn't configured", async () => {
    const { app, reported } = testApp({
      exerciseLibrary: null,
      services: fakeServices({}),
    });

    const response = await put(app, body());

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "exercise_library_unavailable"
    );
    expect(reported).toEqual([
      new Error(
        "Missing EXERCISES_URL or EXERCISES_API_SECRET environment variable"
      ),
    ]);
  });

  it("never shows fields beyond the contract", async () => {
    const { services } = recordingServices();
    const { app } = testApp({ services });

    const response = await put(app, body());

    expect(JSON.stringify(await response.json())).not.toMatch(
      LEGACY_OR_INTERNAL_FIELD
    );
  });

  /** `body()` with one change made by `edit`. */
  const invalid = (edit: (payload: ReturnType<typeof body>) => void) => {
    const payload = body();
    edit(payload);
    return payload;
  };

  it.each([
    ["an empty body", {}],
    ["a bare list of Workouts", body().workouts],
    ["no Workouts", { workouts: [] }],
    [
      "a Workout without Exercises",
      invalid((payload) => {
        payload.workouts[1].exercises = [];
      }),
    ],
    [
      "an Exercise without sets",
      invalid((payload) => {
        payload.workouts[0].exercises[0].sets = [];
      }),
    ],
    [
      "an empty Workout name",
      invalid((payload) => {
        payload.workouts[0].name = " ";
      }),
    ],
    [
      "a weight with 3 decimals",
      invalid((payload) => {
        payload.workouts[0].exercises[0].sets[0].weight_recommended = 80.125;
      }),
    ],
    [
      "a malformed slug",
      invalid((payload) => {
        payload.workouts[0].exercises[0].exercise_slug = "Barbell Back Squat";
      }),
    ],
    [
      "a Workout id",
      invalid((payload) => {
        Object.assign(payload.workouts[0], {
          id: "a1d6c0b2-7e3f-4f0a-9c1d-3b5e7a9c1d20",
        });
      }),
    ],
    ["Plan metadata", { ...body(), name: "Renamed" }],
  ])("answers 400 invalid_request for %s, unreported", async (_, payload) => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await put(app, payload);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for a Plan id that isn't a uuid, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await put(app, body(), { id: "not-a-uuid" });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });

  it("answers 415 for a body that isn't JSON, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await app.request(`/v1/plans/${planId}/workouts`, {
      body: "workouts=none",
      headers: {
        ...signedInAs("user_alice"),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "PUT",
    });

    expect(response.status).toBe(415);
    expect(reported).toEqual([]);
  });

  it("answers 401 without a session token", async () => {
    const { app } = testApp({ services: fakeServices({}) });

    const response = await put(app, body(), { headers: {} });

    expect(response.status).toBe(401);
  });
});
