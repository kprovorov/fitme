import { LibraryUnavailableError } from "@fitme/library-sdk";
import { memoryRateLimiter } from "@fitme/rate-limit";
import type {
  SavedPlan,
  SavePlanOptions,
  SavePlanResult,
} from "@fitme/services/plans";
import { describe, expect, it } from "vitest";

import {
  fakeServices,
  libraryCover,
  libraryExercise,
  signedInAs,
  testApp,
} from "../test/harness.js";

const planId = "6f0c1d7e-3b1a-4d7e-9a43-2f6b0c1e5a10";
const KEPT_WORKOUT = "a1d6c0b2-7e3f-4f0a-9c1d-3b5e7a9c1d20";
const KEPT_EXERCISE = "c3f8e2d4-9a51-4b2c-9e3f-5d7a9c1e3f40";
const KEPT_SET = "d4a9f3e5-0b62-4c3d-8f4a-6e8b0d2f4a50";

const exercises = [
  libraryExercise("barbell-back-squat", ["quadriceps"]),
  libraryExercise("barbell-deadlift", ["hamstrings"]),
];

const LEGS_COVER = "5b1e7c2a-8d4f-4a6b-9c3e-1f2a3b4c5d6e";
const HINGE_COVER = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

/** A field of the services' answer the contract never shows. */
const LEGACY_OR_INTERNAL_FIELD =
  /"(?<field>exercise_id|exercise|deleted_at|request_key|user_id)"/u;

/** A valid body: a kept Workout (with a kept Exercise and set) and a new one. */
const body = () => ({
  experience_level: "intermediate",
  frequency: 3,
  goal: "muscle-gain",
  name: "Full body",
  place: "gym",
  workout_duration: 60,
  workouts: [
    {
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          id: KEPT_EXERCISE,
          sets: [
            {
              id: KEPT_SET,
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 80.5,
            },
            {
              reps_recommended: 6,
              rest_recommended: 120,
              weight_recommended: 85,
            },
          ],
        },
      ],
      id: KEPT_WORKOUT,
      name: "Day A",
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
      name: "Day B",
    },
  ],
});

/** The saved Plan, as the contract shows it, without its `weight_unit`. */
const saved = {
  created_at: "2026-10-20T09:00:00+00:00",
  description: null,
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
      cover: LEGS_COVER,
      description: "",
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          id: KEPT_EXERCISE,
          order: 1,
          sets: [
            {
              id: KEPT_SET,
              order: 1,
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 80.5,
            },
          ],
        },
      ],
      id: KEPT_WORKOUT,
      name: "Day A",
      order: 1,
    },
  ],
};

/** `saved` as the services return it: with their internal fields. */
const servicesSaved = {
  ...saved,
  deleted_at: null,
  user_id: "user_alice",
  workouts: saved.workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      request_key: null,
    })),
  })),
};

/**
 * Services whose `savePlan` records what it was asked, the Covers its
 * `coverNewWorkouts` picks given `usedCoverIds`, and answers `result`.
 */
const recordingServices = ({
  result = { plan: servicesSaved, status: "saved" },
  usedCoverIds = [],
  weightUnit = "kg",
}: {
  result?: SavePlanResult;
  usedCoverIds?: string[];
  weightUnit?: "kg" | "lbs";
} = {}) => {
  const calls: {
    covers: (string | null)[] | undefined;
    plan: SavedPlan;
    planId: string;
  }[] = [];

  const services = fakeServices({
    savePlan: (id, plan, { coverNewWorkouts }: SavePlanOptions) => {
      calls.push({
        covers: coverNewWorkouts?.(
          plan.workouts.filter((workout) => workout.id === undefined),
          usedCoverIds
        ),
        plan,
        planId: id,
      });

      return Promise.resolve({ value: result, weightUnit });
    },
  });

  return { calls, services };
};

/** `body()` with one change made by `edit`. */
const invalid = (edit: (payload: ReturnType<typeof body>) => void) => {
  const payload = body();
  edit(payload);

  return payload;
};

type TestPlanPayload = Partial<ReturnType<typeof body>>;

const put = (
  app: ReturnType<typeof testApp>["app"],
  payload: TestPlanPayload,
  {
    headers = signedInAs("user_alice"),
    id = planId,
  }: { headers?: Record<string, string>; id?: string } = {}
) =>
  app.request(`/v1/plans/${id}`, {
    body: JSON.stringify(payload),
    headers: { ...headers, "content-type": "application/json" },
    method: "PUT",
  });

describe("pUT /v1/plans/{id}", () => {
  it("saves the sent Plan with its ids and answers it in full with its weight unit", async () => {
    const { calls, services } = recordingServices();
    const { app, reported, servicesFor } = testApp({ exercises, services });

    const response = await put(app, body());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: { ...saved, weight_unit: "kg" },
    });
    expect(calls).toStrictEqual([{ covers: [null], plan: body(), planId }]);
    expect(servicesFor).toStrictEqual(["user_alice"]);
    expect(reported).toStrictEqual([]);
  });

  it("picks the new Workouts' Covers among the ones the kept Workouts don't hold", async () => {
    const { calls, services } = recordingServices({
      usedCoverIds: [HINGE_COVER],
    });

    const { app } = testApp({
      covers: [
        libraryCover(HINGE_COVER, ["hamstrings"]),
        libraryCover(LEGS_COVER, ["quadriceps"]),
      ],
      exercises,
      services,
    });

    const response = await put(app, body());

    // Day B trains hamstrings, but a kept Workout holds the hinge Cover
    expect(response.status).toBe(200);
    expect(calls[0].covers).toStrictEqual([LEGS_COVER]);
  });

  it("reads no Covers when every Workout is kept", async () => {
    const { calls, services } = recordingServices();
    const { app, library } = testApp({ exercises, services });
    library.covers = () => Promise.reject(new LibraryUnavailableError());
    const payload = body();
    payload.workouts = [payload.workouts[0]];

    const response = await put(app, payload);

    expect(response.status).toBe(200);
    expect(calls[0].covers).toStrictEqual([]);
  });

  it("answers the weight unit of the User's Profile", async () => {
    const { services } = recordingServices({ weightUnit: "lbs" });
    const { app } = testApp({ exercises, services });

    const response = await put(app, body());

    const responseBody = await response.json();
    expect(responseBody.data.weight_unit).toBe("lbs");
  });

  it("answers 404 not_found when the User has no such live Plan, unreported", async () => {
    const { services } = recordingServices({
      result: { status: "not_found" },
    });

    const { app, reported } = testApp({ exercises, services });

    const response = await put(app, body());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toStrictEqual({
      error: { code: "not_found", message: "Plan not found" },
    });
    expect(reported).toStrictEqual([]);
  });

  it("answers 400 invalid_request naming the ids that aren't the Plan's or sit under another parent, unreported", async () => {
    const { services } = recordingServices({
      result: { ids: [KEPT_EXERCISE, KEPT_SET], status: "invalid_ids" },
    });

    const { app, reported } = testApp({ exercises, services });

    const response = await put(app, body());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      error: {
        code: "invalid_request",
        message: `Not this Plan's, or not under the parent sent: ${KEPT_EXERCISE}, ${KEPT_SET}`,
      },
    });
    expect(reported).toStrictEqual([]);
  });

  it("answers 400 unknown_exercises naming each unknown slug once, writes nothing, unreported", async () => {
    // savePlan isn't faked: calling it would fail the request with a 500
    const { app, reported } = testApp({
      exercises,
      services: fakeServices({}),
    });

    const payload = body();
    payload.workouts[0].exercises[0].exercise_slug = "made-up-press";
    payload.workouts[1].exercises[0].exercise_slug = "made-up-press";

    const response = await put(app, payload);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      error: {
        code: "unknown_exercises",
        message: "Unknown exercise_slug(s): made-up-press",
      },
    });
    expect(reported).toStrictEqual([]);
  });

  it("answers a reported 503 library_unavailable when the Library fails, writing nothing", async () => {
    const { app, library, reported } = testApp({
      exercises,
      services: fakeServices({}),
    });

    const outage = new LibraryUnavailableError();
    library.failWith(outage);

    const response = await put(app, body());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toStrictEqual({
      error: {
        code: "library_unavailable",
        message:
          "The Library is unavailable, so the Exercises couldn't be checked; try again",
      },
    });
    expect(reported).toStrictEqual([outage]);
  });

  it("answers a reported 503 library_unavailable when a new Workout's Covers can't be read, writing nothing", async () => {
    const { app, library, reported } = testApp({
      exercises,
      services: fakeServices({}),
    });

    const outage = new LibraryUnavailableError();
    library.covers = () => Promise.reject(outage);

    const response = await put(app, body());

    expect(response.status).toBe(503);
    const responseBody = await response.json();
    expect(responseBody.error.code).toBe("library_unavailable");
    expect(reported).toStrictEqual([outage]);
  });

  it("never shows fields beyond the contract", async () => {
    const { services } = recordingServices();
    const { app } = testApp({ exercises, services });

    const response = await put(app, body());

    expect(JSON.stringify(await response.json())).not.toMatch(
      LEGACY_OR_INTERNAL_FIELD
    );
  });

  it.each([
    ["an empty body", {}],
    [
      "no name",
      invalid((payload) => {
        Reflect.deleteProperty(payload, "name");
      }),
    ],
    [
      "no goal",
      invalid((payload) => {
        Reflect.deleteProperty(payload, "goal");
      }),
    ],
    [
      "a frequency out of bounds",
      invalid((payload) => {
        payload.frequency = 8;
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
      "an empty Workout name",
      invalid((payload) => {
        payload.workouts[0].name = " ";
      }),
    ],
    [
      "reps out of bounds",
      invalid((payload) => {
        payload.workouts[0].exercises[0].sets[0].reps_recommended = 0;
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
      "an id that isn't a uuid",
      invalid((payload) => {
        payload.workouts[0].id = "day-a";
      }),
    ],
    [
      "a Workout's cover (the server assigns it)",
      invalid((payload) => {
        Object.assign(payload.workouts[0], { cover: LEGS_COVER });
      }),
    ],
    [
      "a set's order (the array gives it)",
      invalid((payload) => {
        Object.assign(payload.workouts[0].exercises[0].sets[0], { order: 2 });
      }),
    ],
    [
      "activate",
      invalid((payload) => {
        Object.assign(payload, { activate: true });
      }),
    ],
  ])("answers 400 invalid_request for %s, unreported", async (_, payload) => {
    const { app, reported } = testApp({
      exercises,
      services: fakeServices({}),
    });

    const response = await put(app, payload);

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).toBe("invalid_request");
    expect(reported).toStrictEqual([]);
  });

  it("answers 400 invalid_request for a Plan id that isn't a uuid, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await put(app, body(), { id: "not-a-uuid" });

    expect(response.status).toBe(400);
    const responseBody = await response.json();
    expect(responseBody.error.code).toBe("invalid_request");
    expect(reported).toStrictEqual([]);
  });

  it("answers 415 for a body that isn't JSON, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await app.request(`/v1/plans/${planId}`, {
      body: "name=Full body",
      headers: {
        ...signedInAs("user_alice"),
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "PUT",
    });

    expect(response.status).toBe(415);
    expect(reported).toStrictEqual([]);
  });

  it("answers 401 without a session token", async () => {
    const { app } = testApp({ services: fakeServices({}) });

    const response = await put(app, body(), { headers: {} });

    expect(response.status).toBe(401);
  });

  it("answers 429 rate_limited with Retry-After once the User is over the limit, saving nothing", async () => {
    const { calls, services } = recordingServices();

    const { app } = testApp({
      exercises,
      rateLimiter: memoryRateLimiter({ limit: 1, windowMs: 60_000 }),
      services,
    });

    const first = await put(app, body());
    const second = await put(app, body());

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    const responseBody = await second.json();
    expect(responseBody.error.code).toBe("rate_limited");
    expect(calls).toHaveLength(1);
  });
});
