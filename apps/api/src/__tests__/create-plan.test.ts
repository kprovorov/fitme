import { LibraryUnavailableError } from "@fitme/library-sdk";
import type { CreatePlanOptions, NewPlan } from "@fitme/services/plans";
import { describe, expect, it } from "vitest";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const planId = "6f0c1d7e-3b1a-4d7e-9a43-2f6b0c1e5a10";

/** A field of the services' answer the contract never shows. */
const LEGACY_OR_INTERNAL_FIELD =
  /"(exercise_id|exercise|deleted_at|request_key|user_id)"/;

/** A valid body: two Workouts over the Exercises the test library knows. */
const body = () => ({
  description: "Three full-body days",
  experience_level: "intermediate",
  frequency: 3,
  goal: "muscle-gain",
  name: "Full body",
  place: "gym",
  workout_duration: 60,
  workouts: [
    {
      description: "Squats then deadlifts",
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
        {
          exercise_slug: "barbell-deadlift",
          sets: [
            {
              reps_recommended: 5,
              rest_recommended: 180,
              weight_recommended: 120,
            },
          ],
        },
      ],
      name: "Day A",
    },
    {
      description: "Deadlifts only",
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
      name: "Day B",
    },
  ],
});

/** The created Plan as the contract shows it, without its `weight_unit`. */
const created = {
  created_at: "2026-10-24T09:00:00+00:00",
  description: "Three full-body days",
  experience_level: "intermediate",
  frequency: 3,
  goal: "muscle-gain",
  id: planId,
  is_active: true,
  name: "Full body",
  note: null,
  place: "gym",
  updated_at: "2026-10-24T09:00:00+00:00",
  workout_duration: 60,
  workouts: [
    {
      description: "Squats then deadlifts",
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
      name: "Day A",
      order: 1,
    },
  ],
};

/** `created` as the services return it: with their internal fields. */
const servicesCreated = {
  ...created,
  deleted_at: null,
  user_id: "user_alice",
  workouts: created.workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      request_key: null,
    })),
  })),
};

/** Services whose `createPlan` records what it was asked and answers `servicesCreated`. */
const recordingServices = (weightUnit: "kg" | "lbs" = "kg") => {
  const calls: { options: CreatePlanOptions; plan: NewPlan }[] = [];
  const services = fakeServices({
    createPlan: (plan, options) => {
      calls.push({ options, plan });
      return Promise.resolve({ value: servicesCreated, weightUnit });
    },
  });
  return { calls, services };
};

const post = (
  app: ReturnType<typeof testApp>["app"],
  payload: unknown,
  headers: Record<string, string> = signedInAs("user_alice")
) =>
  app.request("/v1/plans", {
    body: JSON.stringify(payload),
    headers: { ...headers, "content-type": "application/json" },
    method: "POST",
  });

describe("POST /v1/plans", () => {
  it("creates the Plan, active by default, and answers it in full with its weight unit", async () => {
    const { calls, services } = recordingServices();
    const { app, reported, servicesFor } = testApp({ services });

    const response = await post(app, body());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: { ...created, weight_unit: "kg" },
    });
    const { workouts, ...metadata } = body();
    expect(calls).toEqual([
      { options: { activate: true }, plan: { ...metadata, workouts } },
    ]);
    expect(servicesFor).toEqual(["user_alice"]);
    expect(reported).toEqual([]);
  });

  it("passes activate: false on, to keep the active Plan", async () => {
    const { calls, services } = recordingServices();
    const { app } = testApp({ services });

    const response = await post(app, { ...body(), activate: false });

    expect(response.status).toBe(201);
    expect(calls.map((call) => call.options)).toEqual([{ activate: false }]);
    expect(calls[0].plan).not.toHaveProperty("activate");
  });

  it("takes an optional note, null included", async () => {
    const { calls, services } = recordingServices();
    const { app } = testApp({ services });

    await post(app, { ...body(), note: "Deload every fourth week" });
    await post(app, { ...body(), note: null });

    expect(calls.map((call) => call.plan.note)).toEqual([
      "Deload every fourth week",
      null,
    ]);
  });

  it("answers the weight unit of the User's Profile", async () => {
    const { services } = recordingServices("lbs");
    const { app } = testApp({ services });

    const response = await post(app, body());

    expect((await response.json()).data.weight_unit).toBe("lbs");
  });

  it("answers 400 unknown_exercises naming each unknown slug once, writes nothing, unreported", async () => {
    // createPlan isn't faked: calling it would fail the request with a 500
    const { app, reported } = testApp({ services: fakeServices({}) });
    const payload = body();
    payload.workouts[0].exercises[0].exercise_slug = "made-up-press";
    payload.workouts[1].exercises.push({
      exercise_slug: "made-up-press",
      sets: [
        { reps_recommended: 5, rest_recommended: 60, weight_recommended: 0 },
      ],
    });
    payload.workouts[1].exercises.push({
      exercise_slug: "made-up-row",
      sets: [
        { reps_recommended: 5, rest_recommended: 60, weight_recommended: 0 },
      ],
    });

    const response = await post(app, payload);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "unknown_exercises",
        message: "Unknown exercise_slug(s): made-up-press, made-up-row",
      },
    });
    expect(reported).toEqual([]);
  });

  it("answers a reported 503 exercise_library_unavailable when the Library fails, writing nothing", async () => {
    const { app, library, reported } = testApp({ services: fakeServices({}) });
    const outage = new LibraryUnavailableError();
    library.failWith(outage);

    const response = await post(app, body());

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

  it("answers a reported 503 exercise_library_unavailable when the Library isn't configured", async () => {
    const { app, reported } = testApp({
      library: null,
      services: fakeServices({}),
    });

    const response = await post(app, body());

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "exercise_library_unavailable"
    );
    expect(reported).toEqual([
      new Error(
        "Missing LIBRARY_URL or LIBRARY_PUBLIC_API_SECRET environment variable"
      ),
    ]);
  });

  it("never shows fields beyond the contract", async () => {
    const { services } = recordingServices();
    const { app } = testApp({ services });

    const response = await post(app, body());

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
    [
      "a missing field",
      invalid((payload) => {
        Reflect.deleteProperty(payload, "goal");
      }),
    ],
    [
      "an unknown goal",
      invalid((payload) => {
        payload.goal = "get-huge";
      }),
    ],
    [
      "an empty name",
      invalid((payload) => {
        payload.name = "  ";
      }),
    ],
    [
      "no Workouts",
      invalid((payload) => {
        payload.workouts = [];
      }),
    ],
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
      "reps over the limit",
      invalid((payload) => {
        payload.workouts[0].exercises[0].sets[0].reps_recommended = 1001;
      }),
    ],
    [
      "zero reps",
      invalid((payload) => {
        payload.workouts[0].exercises[0].sets[0].reps_recommended = 0;
      }),
    ],
    [
      "a weight over the limit",
      invalid((payload) => {
        payload.workouts[0].exercises[0].sets[0].weight_recommended = 10_000.5;
      }),
    ],
    [
      "a negative weight",
      invalid((payload) => {
        payload.workouts[0].exercises[0].sets[0].weight_recommended = -1;
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
    ["an unknown field on the Plan", { ...body(), is_active: true }],
    [
      "an unknown field on a set",
      invalid((payload) => {
        Object.assign(payload.workouts[0].exercises[0].sets[0], { order: 2 });
      }),
    ],
    [
      "a legacy exercise_id",
      invalid((payload) => {
        Object.assign(payload.workouts[0].exercises[0], {
          exercise_id: "f6c1b5a7-2d84-4e5f-8b6c-8a0d2f4b6c70",
        });
      }),
    ],
    ["a non-boolean activate", { ...body(), activate: "no" }],
  ])("answers 400 invalid_request for %s, unreported", async (_, payload) => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await post(app, payload);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });

  it("answers 415 for a body that isn't JSON, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await app.request("/v1/plans", {
      body: "name=Full+body",
      headers: {
        ...signedInAs("user_alice"),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    expect(response.status).toBe(415);
    expect(reported).toEqual([]);
  });

  it("answers 401 without a session token", async () => {
    const { app } = testApp({ services: fakeServices({}) });

    const response = await post(app, body(), {});

    expect(response.status).toBe(401);
  });
});
