import type { PlanDetail } from "@fitme/services/plans";
import { describe, expect, it } from "vitest";
import type { UserServices } from "../services.js";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const planId = "6f0c1d7e-3b1a-4d7e-9a43-2f6b0c1e5a10";
const workoutId = "a1d6c0b2-7e3f-4f0a-9c1d-3b5e7a9c1d20";

/** A Plan in full as the contract shows it, without its `weight_unit`. */
const detail = {
  created_at: "2026-10-20T09:00:00+00:00",
  description: "Three full-body days",
  experience_level: "intermediate",
  frequency: 3,
  goal: "muscle-gain",
  id: planId,
  is_active: true,
  name: "Full body",
  note: null,
  place: "gym",
  updated_at: "2026-10-21T09:00:00+00:00",
  workout_duration: 60,
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
          ],
        },
      ],
      id: workoutId,
      name: "Day A",
      order: 1,
    },
  ],
};

/** `detail` as the services return it, with fields the contract never shows. */
const weighed = (plan: object = {}, weightUnit: "kg" | "lbs" = "kg") => ({
  value: {
    ...detail,
    deleted_at: null,
    user_id: "user_alice",
    ...plan,
  } as unknown as PlanDetail,
  weightUnit,
});

const json = (method: string, body: unknown) => ({
  body: JSON.stringify(body),
  headers: { ...signedInAs("user_alice"), "content-type": "application/json" },
  method,
});

const patch = (services: Partial<UserServices>, body: unknown, id = planId) => {
  const harness = testApp({ services: fakeServices(services) });
  return {
    ...harness,
    response: harness.app.request(`/v1/plans/${id}`, json("PATCH", body)),
  };
};

describe("PATCH /v1/plans/{id}", () => {
  it("changes only the given fields and answers the Plan in full", async () => {
    const asked: unknown[] = [];
    const { reported, response, servicesFor } = patch(
      {
        updatePlan: (id, changes) => {
          asked.push([id, changes]);
          return Promise.resolve(
            weighed({ name: "Renamed", note: "Deload" }, "lbs")
          );
        },
      },
      { name: "Renamed", note: "Deload" }
    );

    const answered = await response;

    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({
      data: { ...detail, name: "Renamed", note: "Deload", weight_unit: "lbs" },
    });
    expect(asked).toEqual([[planId, { name: "Renamed", note: "Deload" }]]);
    expect(servicesFor).toEqual(["user_alice"]);
    expect(reported).toEqual([]);
  });

  it("takes every metadata field, and note null clears the note", async () => {
    const changes = {
      description: "Four days",
      experience_level: "advanced",
      frequency: 4,
      goal: "strength-performance",
      name: "Strength",
      note: null,
      place: "home",
      workout_duration: 45,
    };
    const asked: unknown[] = [];
    const { response } = patch(
      {
        updatePlan: (_id, given) => {
          asked.push(given);
          return Promise.resolve(weighed(changes));
        },
      },
      changes
    );

    expect((await response).status).toBe(200);
    expect(asked).toEqual([changes]);
  });

  it.each([
    ["workouts", { workouts: [] }],
    ["an unknown field", { name: "Renamed", owner: "user_bob" }],
    ["an empty body", {}],
    ["an invalid value", { frequency: 0 }],
    ["an unknown goal", { goal: "fly" }],
    ["a blank name", { name: "  " }],
  ])(
    "answers 400 invalid_request, nothing changed, for %s",
    async (_label, body) => {
      const { reported, response } = patch({}, body);

      const answered = await response;

      expect(answered.status).toBe(400);
      expect((await answered.json()).error.code).toBe("invalid_request");
      expect(reported).toEqual([]);
    }
  );

  it("names workouts in its 400", async () => {
    const { response } = patch({}, { name: "Renamed", workouts: [] });

    expect((await (await response).json()).error.message).toContain("workouts");
  });

  it("answers 404 not_found, unreported, for a Plan the services don't find", async () => {
    const { reported, response } = patch(
      { updatePlan: () => Promise.resolve(null) },
      { name: "Renamed" }
    );

    const answered = await response;

    expect(answered.status).toBe(404);
    expect(await answered.json()).toEqual({
      error: { code: "not_found", message: "Plan not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for an id that isn't a uuid", async () => {
    const { response } = patch({}, { name: "Renamed" }, "not-a-uuid");

    expect((await response).status).toBe(400);
  });

  it("answers 401 without a session token", async () => {
    const { app } = testApp();

    const response = await app.request(`/v1/plans/${planId}`, {
      body: JSON.stringify({ name: "Renamed" }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(401);
  });
});

const post = (services: Partial<UserServices>, id = planId) => {
  const harness = testApp({ services: fakeServices(services) });
  return {
    ...harness,
    response: harness.app.request(`/v1/plans/${id}/activate`, {
      headers: signedInAs("user_alice"),
      method: "POST",
    }),
  };
};

describe("POST /v1/plans/{id}/activate", () => {
  it("activates the Plan and answers it in full", async () => {
    const asked: string[] = [];
    const { reported, response, servicesFor } = post({
      activatePlan: (id) => {
        asked.push(id);
        return Promise.resolve(weighed({ is_active: true }, "lbs"));
      },
    });

    const answered = await response;

    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({
      data: { ...detail, is_active: true, weight_unit: "lbs" },
    });
    expect(asked).toEqual([planId]);
    expect(servicesFor).toEqual(["user_alice"]);
    expect(reported).toEqual([]);
  });

  it("answers 404 not_found, unreported, for a Plan the services don't find", async () => {
    const { reported, response } = post({
      activatePlan: () => Promise.resolve(null),
    });

    const answered = await response;

    expect(answered.status).toBe(404);
    expect(await answered.json()).toEqual({
      error: { code: "not_found", message: "Plan not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for an id that isn't a uuid", async () => {
    const { response } = post({}, "not-a-uuid");

    const answered = await response;

    expect(answered.status).toBe(400);
    expect((await answered.json()).error.code).toBe("invalid_request");
  });

  it("answers 401 without a session token", async () => {
    const { app } = testApp();

    const response = await app.request(`/v1/plans/${planId}/activate`, {
      method: "POST",
    });

    expect(response.status).toBe(401);
  });
});

const remove = (services: Partial<UserServices>, id = planId) => {
  const harness = testApp({ services: fakeServices(services) });
  return {
    ...harness,
    response: harness.app.request(`/v1/plans/${id}`, {
      headers: signedInAs("user_alice"),
      method: "DELETE",
    }),
  };
};

const deleted = (alreadyDeleted: boolean) => ({
  alreadyDeleted,
  deleted: true as const,
  plan: { id: planId, name: "Full body" },
});

describe("DELETE /v1/plans/{id}", () => {
  it.each([
    ["deletes the Plan", false],
    ["answers the same for a Plan already deleted", true],
  ])("%s: 204 with no body", async (_label, alreadyDeleted) => {
    const asked: string[] = [];
    const { reported, response, servicesFor } = remove({
      deletePlan: (id) => {
        asked.push(id);
        return Promise.resolve(deleted(alreadyDeleted));
      },
    });

    const answered = await response;

    expect(answered.status).toBe(204);
    expect(await answered.text()).toBe("");
    expect(asked).toEqual([planId]);
    expect(servicesFor).toEqual(["user_alice"]);
    expect(reported).toEqual([]);
  });

  it("answers 404 not_found, unreported, for a Plan the User never had", async () => {
    const { reported, response } = remove({
      deletePlan: () => Promise.resolve(null),
    });

    const answered = await response;

    expect(answered.status).toBe(404);
    expect(await answered.json()).toEqual({
      error: { code: "not_found", message: "Plan not found" },
    });
    expect(reported).toEqual([]);
  });

  it("answers 400 invalid_request for an id that isn't a uuid", async () => {
    const { response } = remove({}, "not-a-uuid");

    expect((await response).status).toBe(400);
  });

  it("answers 401 without a session token", async () => {
    const { app } = testApp();

    const response = await app.request(`/v1/plans/${planId}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(401);
  });
});
