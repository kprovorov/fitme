import { describe, expect, it } from "vitest";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const planId = "6f0c1d7e-3b1a-4d7e-9a43-2f6b0c1e5a10";
const otherPlanId = "0b8f4e8a-5c2d-4e61-8f0d-7a3c9b1e2d40";

/** A Plan's own columns, as the services render them. */
const planColumns = {
  created_at: "2026-10-20T09:00:00+00:00",
  description: "Three full-body days",
  experience_level: "intermediate",
  frequency: 3,
  goal: "build_muscle",
  id: planId,
  is_active: true,
  name: "Full body",
  note: null,
  place: "gym",
  updated_at: "2026-10-21T09:00:00+00:00",
  workout_duration: 60,
};

const summary = {
  ...planColumns,
  workouts: [
    {
      exercise_count: 2,
      id: "a1d6c0b2-7e3f-4f0a-9c1d-3b5e7a9c1d20",
      name: "Day B",
      order: 1,
    },
    {
      exercise_count: 1,
      id: "b2e7d1c3-8f40-4a1b-8d2e-4c6f8b0d2e30",
      name: "Day A",
      order: 2,
    },
  ],
};

describe("GET /v1/plans", () => {
  it("answers the signed-in User's Plans as the services list them", async () => {
    const older = {
      ...planColumns,
      created_at: "2026-10-01T09:00:00+00:00",
      id: otherPlanId,
      is_active: false,
      workouts: [],
    };
    const { app, servicesFor } = testApp({
      services: fakeServices({
        listPlans: () => Promise.resolve([summary, older]),
      }),
    });

    const response = await app.request("/v1/plans", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [summary, older] });
    expect(servicesFor).toEqual(["user_alice"]);
  });

  it("answers an empty list for a User without Plans", async () => {
    const { app } = testApp({
      services: fakeServices({ listPlans: () => Promise.resolve([]) }),
    });

    const response = await app.request("/v1/plans", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
  });

  it("never shows fields beyond the contract", async () => {
    const { app } = testApp({
      services: fakeServices({
        listPlans: () =>
          Promise.resolve([
            {
              ...summary,
              deleted_at: null,
              user_id: "user_alice",
              workouts: summary.workouts.map((workout) => ({
                ...workout,
                plan_id: planId,
              })),
            },
          ]),
      }),
    });

    const response = await app.request("/v1/plans", {
      headers: signedInAs("user_alice"),
    });

    expect(await response.json()).toEqual({ data: [summary] });
  });

  it("answers 401 without a session token", async () => {
    const { app } = testApp();

    const response = await app.request("/v1/plans");

    expect(response.status).toBe(401);
  });
});

/** A Plan in full as the contract shows it, without its `weight_unit`. */
const detail = {
  ...planColumns,
  workouts: [
    {
      description: "Legs and pulls",
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
            {
              id: "e5b0a4f6-1c73-4d4e-9a5b-7f9c1e3a5b60",
              order: 2,
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 80.5,
            },
          ],
        },
      ],
      id: "a1d6c0b2-7e3f-4f0a-9c1d-3b5e7a9c1d20",
      name: "Day B",
      order: 1,
    },
  ],
};

/** `detail` as the services return it: with the legacy and internal fields. */
const servicesDetail = {
  ...detail,
  deleted_at: null,
  user_id: "user_alice",
  workouts: detail.workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      exercise: {
        id: "f6c1b5a7-2d84-4e5f-8b6c-8a0d2f4b6c70",
        muscle_groups: ["quadriceps", "glutes"],
        name: "Barbell Back Squat",
      },
      exercise_id: "f6c1b5a7-2d84-4e5f-8b6c-8a0d2f4b6c70",
      request_key: "abc",
      sets: exercise.sets.map((set) => ({ ...set, request_key: null })),
    })),
  })),
};

const weighed = (weightUnit: string) => ({
  value: servicesDetail,
  weightUnit,
});

describe("GET /v1/plans/{id}", () => {
  it("answers the Plan in full, Exercises by slug only, with its weight unit", async () => {
    const asked: string[] = [];
    const { app, reported } = testApp({
      services: fakeServices({
        getPlan: (id) => {
          asked.push(id);
          return Promise.resolve(weighed("kg"));
        },
      }),
    });

    const response = await app.request(`/v1/plans/${planId}`, {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { ...detail, weight_unit: "kg" },
    });
    expect(asked).toEqual([planId]);
    expect(reported).toEqual([]);
  });

  it.each(["kg", "lbs"] as const)(
    "returns weights as stored, in %s",
    async (weightUnit) => {
      const { app } = testApp({
        services: fakeServices({
          getPlan: () => Promise.resolve(weighed(weightUnit)),
        }),
      });

      const response = await app.request(`/v1/plans/${planId}`, {
        headers: signedInAs("user_alice"),
      });

      const body = await response.json();
      expect(body.data.weight_unit).toBe(weightUnit);
      expect(
        body.data.workouts[0].exercises[0].sets[0].weight_recommended
      ).toBe(80.5);
    }
  );

  it("answers 404 not_found, unreported, for a Plan the services don't find", async () => {
    const { app, reported } = testApp({
      services: fakeServices({ getPlan: () => Promise.resolve(null) }),
    });

    const response = await app.request(`/v1/plans/${otherPlanId}`, {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Plan not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for an id that isn't a uuid", async () => {
    const { app, reported } = testApp({
      services: fakeServices({}),
    });

    const response = await app.request("/v1/plans/not-a-uuid", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(reported).toEqual([]);
  });
});

describe("GET /v1/plans/active", () => {
  it("answers the active Plan in full with its weight unit", async () => {
    const { app } = testApp({
      services: fakeServices({
        getActivePlan: () => Promise.resolve(weighed("lbs")),
      }),
    });

    const response = await app.request("/v1/plans/active", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { ...detail, weight_unit: "lbs" },
    });
  });

  it("answers { data: null } without an active Plan", async () => {
    const { app, reported } = testApp({
      services: fakeServices({ getActivePlan: () => Promise.resolve(null) }),
    });

    const response = await app.request("/v1/plans/active", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
    expect(reported).toEqual([]);
  });
});
