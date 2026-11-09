import type {
  NewPlan,
  PlanChanges,
  PlanDetail,
  SavedPlan,
  SavePlanOptions,
} from "@fitme/services/plans";
import { describe, expect, it } from "vitest";

import { fakeServices, signedInAs, testApp } from "../test/harness.js";

/**
 * A Plan built by hand has only a name and a frequency (ADR 0017): its goal,
 * place, experience level and workout duration are unset. The writes take all
 * four as optional, `PATCH` clears one with `null`, and every read answers
 * them as `null`.
 */

const planId = "6f0c1d7e-3b1a-4d7e-9a43-2f6b0c1e5a10";
const workoutId = "a1d6c0b2-7e3f-4f0a-9c1d-3b5e7a9c1d20";
const exerciseId = "c3f8e2d4-9a51-4b2c-9e3f-5d7a9c1e3f40";
const setId = "d4a9f3e5-0b62-4c3d-8f4a-6e8b0d2f4a50";

/** The four details a Plan may leave unset. */
const UNSET_DETAILS = {
  experience_level: null,
  goal: null,
  place: null,
  workout_duration: null,
} as const;

/** A Plan in full with every detail unset, as the services render it. */
const unsetPlan: PlanDetail = {
  created_at: "2026-11-09T09:00:00+00:00",
  description: null,
  ...UNSET_DETAILS,
  frequency: 3,
  id: planId,
  is_active: true,
  name: "My plan",
  note: null,
  updated_at: "2026-11-09T09:00:00+00:00",
  workouts: [
    {
      cover: null,
      description: "",
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          id: exerciseId,
          order: 1,
          sets: [
            {
              id: setId,
              order: 1,
              reps_recommended: 10,
              rest_recommended: 90,
              weight_recommended: 0,
            },
          ],
        },
      ],
      id: workoutId,
      name: "Workout A",
      order: 1,
    },
  ],
};

/** The same Plan summarised, as `GET /v1/plans` lists it. */
const unsetSummary = {
  created_at: unsetPlan.created_at,
  description: null,
  ...UNSET_DETAILS,
  frequency: 3,
  id: planId,
  is_active: true,
  name: "My plan",
  note: null,
  updated_at: unsetPlan.updated_at,
  workouts: [
    {
      cover: null,
      exercise_count: 1,
      id: workoutId,
      name: "Workout A",
      order: 1,
    },
  ],
};

/** A Plan the services answer, with the internal fields the contract strips. */
const fromServices = (weightUnit: "kg" | "lbs" = "kg") => ({
  value: { ...unsetPlan, deleted_at: null, user_id: "user_alice" },
  weightUnit,
});

/** The Plan a read answers, as the contract shows it. */
const answered = (weightUnit: "kg" | "lbs" = "kg") => ({
  data: { ...unsetPlan, weight_unit: weightUnit },
});

const sendJson = (method: string, body: unknown) => ({
  body: JSON.stringify(body),
  headers: { ...signedInAs("user_alice"), "content-type": "application/json" },
  method,
});

/** The one Workout every write below sends, over a slug the test Library knows. */
const workouts = [
  {
    exercises: [
      {
        exercise_slug: "barbell-back-squat",
        sets: [
          { reps_recommended: 10, rest_recommended: 90, weight_recommended: 0 },
        ],
      },
    ],
    name: "Workout A",
  },
];

/** The same Workout for a create, whose Workout `description` is required. */
const newWorkouts = workouts.map((workout) => ({
  ...workout,
  description: "",
}));

/** A create body carrying only a name, a frequency and its Workouts. */
const createdByHand = {
  description: "",
  frequency: 3,
  name: "My plan",
  workouts: newWorkouts,
};

describe("pOST /v1/plans without the four details", () => {
  /** Services whose `createPlan` records the Plan it was asked for. */
  const recording = () => {
    const created: NewPlan[] = [];

    return {
      created,
      services: fakeServices({
        createPlan: (plan: NewPlan) => {
          created.push(plan);

          return Promise.resolve(fromServices());
        },
      }),
    };
  };

  it("creates the Plan from a name and a frequency alone, answering the four as null", async () => {
    const { app, reported } = testApp({ services: recording().services });

    const response = await app.request(
      "/v1/plans",
      sendJson("POST", createdByHand)
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toStrictEqual(answered());
    expect(reported).toStrictEqual([]);
  });

  it("asks the services for a Plan naming none of the four", async () => {
    const { created, services } = recording();
    const { app } = testApp({ services });

    await app.request("/v1/plans", sendJson("POST", createdByHand));

    // The Library here has no Covers, so each Workout goes on with `cover: null`.
    expect(created).toStrictEqual([
      {
        description: "",
        frequency: 3,
        name: "My plan",
        workouts: newWorkouts.map((workout) => ({ ...workout, cover: null })),
      },
    ]);
  });

  it.each(["name", "frequency"])(
    "still refuses a create without %s, which stays required",
    async (required) => {
      const { app, reported } = testApp({ services: fakeServices({}) });
      const payload: Partial<typeof createdByHand> = { ...createdByHand };
      Reflect.deleteProperty(payload, required);

      const response = await app.request(
        "/v1/plans",
        sendJson("POST", payload)
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "invalid_request" },
      });
      expect(reported).toStrictEqual([]);
    }
  );
});

describe("pATCH /v1/plans/{id} clearing a detail", () => {
  it.each([
    ["goal", { goal: null }],
    ["place", { place: null }],
    ["experience_level", { experience_level: null }],
    ["workout_duration", { workout_duration: null }],
  ])(
    "passes %s on as null, which the services store unset",
    async (_name, change) => {
      const asked: PlanChanges[] = [];

      const { app, reported } = testApp({
        services: fakeServices({
          updatePlan: (_id: string, changes: PlanChanges) => {
            asked.push(changes);

            return Promise.resolve(fromServices());
          },
        }),
      });

      const response = await app.request(
        `/v1/plans/${planId}`,
        sendJson("PATCH", change)
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual(answered());
      expect(asked).toStrictEqual([change]);
      expect(reported).toStrictEqual([]);
    }
  );

  it.each(["name", "frequency"])(
    "refuses to clear %s, which can be changed but never unset",
    async (field) => {
      const { app, reported } = testApp({ services: fakeServices({}) });

      const response = await app.request(
        `/v1/plans/${planId}`,
        sendJson("PATCH", { [field]: null })
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "invalid_request" },
      });
      expect(reported).toStrictEqual([]);
    }
  );
});

describe("pUT /v1/plans/{id} leaving the four out", () => {
  const savedBody = { frequency: 3, name: "My plan", workouts };

  /** Services whose `savePlan` records the Plan the save sent on. */
  const recording = () => {
    const saved: SavedPlan[] = [];

    return {
      saved,
      services: fakeServices({
        savePlan: (
          _id: string,
          plan: SavedPlan,
          { coverNewWorkouts }: SavePlanOptions
        ) => {
          coverNewWorkouts?.(plan.workouts, []);
          saved.push(plan);

          return Promise.resolve({
            value: { plan: fromServices().value, status: "saved" as const },
            weightUnit: "kg" as const,
          });
        },
      }),
    };
  };

  it("saves the Plan and answers the four as null", async () => {
    const { app, reported } = testApp({ services: recording().services });

    const response = await app.request(
      `/v1/plans/${planId}`,
      sendJson("PUT", savedBody)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual(answered());
    expect(reported).toStrictEqual([]);
  });

  it("sends none of the four on, so the save clears each one", async () => {
    const { saved, services } = recording();
    const { app } = testApp({ services });

    await app.request(`/v1/plans/${planId}`, sendJson("PUT", savedBody));

    expect(saved).toStrictEqual([savedBody]);
  });
});

describe("the reads of a Plan with unset details", () => {
  it("answers the four as null on gET /v1/plans", async () => {
    const { app } = testApp({
      services: fakeServices({
        listPlans: () => Promise.resolve([unsetSummary]),
      }),
    });

    const response = await app.request("/v1/plans", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: [unsetSummary],
    });
  });

  it("answers the four as null on gET /v1/plans/{id}", async () => {
    const { app } = testApp({
      services: fakeServices({
        getPlan: () => Promise.resolve(fromServices()),
      }),
    });

    const response = await app.request(`/v1/plans/${planId}`, {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual(answered());
  });

  it("answers the four as null on gET /v1/plans/active", async () => {
    const { app } = testApp({
      services: fakeServices({
        getActivePlan: () => Promise.resolve(fromServices("lbs")),
      }),
    });

    const response = await app.request("/v1/plans/active", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual(answered("lbs"));
  });

  it("answers the four as null on pOST /v1/plans/{id}/activate", async () => {
    const { app } = testApp({
      services: fakeServices({
        activatePlan: () => Promise.resolve(fromServices()),
      }),
    });

    const response = await app.request(`/v1/plans/${planId}/activate`, {
      headers: signedInAs("user_alice"),
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual(answered());
  });
});
