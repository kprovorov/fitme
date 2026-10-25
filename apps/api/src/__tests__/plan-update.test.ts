import type { PlanUpdate } from "@fitme/services/plan-update";
import { describe, expect, it } from "vitest";
import type { UserServices } from "../services.js";
import { fakeServices, signedInAs, testApp } from "../test/harness.js";

const SESSION_ID = "6f1c0c9e-2b7a-4c1e-9a55-3c2d1e0f4a11";
const PATH = `/v1/workout-sessions/${SESSION_ID}/plan-update`;

const planUpdate: PlanUpdate = {
  changes: [
    {
      exercise_slug: "dumbbell-bench-press",
      kind: "replace_exercise",
      replaced_exercise_slug: "barbell-bench-press",
      sets: [
        { reps: 8, weight: 30 },
        { reps: 6, weight: 30 },
      ],
    },
    {
      exercise_slug: "cable-fly",
      kind: "add_exercise",
      sets: [{ reps: 12, weight: 15 }],
    },
    { exercise_slug: "dips", kind: "remove_exercise" },
    {
      exercise_slug: "barbell-back-squat",
      kind: "add_sets",
      sets: [{ reps: 5, weight: 100.5 }],
    },
  ],
  plan: { id: "0b9e1a52-7c1d-4f3e-8a2b-5d6c7e8f9a01", name: "Strength" },
  weight_unit: "lbs",
  workout: { id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", name: "Push" },
};

const noPlanUpdate: PlanUpdate = {
  changes: [],
  plan: null,
  weight_unit: "kg",
  workout: null,
};

type App = ReturnType<typeof testApp>["app"];

const send = (app: App, method: "GET" | "POST", path = PATH) =>
  app.request(path, { headers: signedInAs("user_alice"), method });

type PlanUpdateMethod = "applyPlanUpdate" | "previewPlanUpdate";

/** A facade whose `method` answers `result`; the other one fails the request. */
const answering = (method: PlanUpdateMethod, result: PlanUpdate | null) => {
  const calls: string[] = [];
  const faked: Partial<UserServices> = {
    [method]: (sessionId: string) => {
      calls.push(sessionId);
      return Promise.resolve(result);
    },
  };
  return { calls, services: fakeServices(faked) };
};

describe.each([
  { method: "GET", service: "previewPlanUpdate" },
  { method: "POST", service: "applyPlanUpdate" },
] as const)(
  "$method /v1/workout-sessions/:id/plan-update",
  ({ method, service }) => {
    it(`answers the Plan Update through ${service} only`, async () => {
      const { calls, services } = answering(service, planUpdate);
      const { app, servicesFor } = testApp({ services });

      const response = await send(app, method);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: planUpdate });
      expect(calls).toEqual([SESSION_ID]);
      expect(servicesFor).toEqual(["user_alice"]);
    });

    it("answers 200 with no changes for a Workout Session without a Plan Update", async () => {
      const { services } = answering(service, noPlanUpdate);
      const { app } = testApp({ services });

      const response = await send(app, method);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: noPlanUpdate });
    });

    it("answers 200 with no changes once applied, its Plan and Workout still named", async () => {
      const applied = { ...planUpdate, changes: [] };
      const { services } = answering(service, applied);
      const { app } = testApp({ services });

      const response = await send(app, method);

      expect(await response.json()).toEqual({ data: applied });
    });

    it("answers 404 not_found for a Workout Session that's missing or another User's, unreported", async () => {
      const { services } = answering(service, null);
      const { app, reported } = testApp({ services });

      const response = await send(app, method);

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "Workout Session not found" },
      });
      expect(reported).toEqual([]);
    });

    it("strips fields beyond the contract", async () => {
      const { services } = answering(service, {
        ...planUpdate,
        changes: [
          {
            exercise_slug: "dips",
            kind: "remove_exercise",
            workoutExerciseId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
          } as PlanUpdate["changes"][number],
        ],
        plan: {
          ...planUpdate.plan,
          user_id: "user_alice",
        } as PlanUpdate["plan"],
      });
      const { app } = testApp({ services });

      const { data } = await (await send(app, method)).json();

      expect(data.changes).toEqual([
        { exercise_slug: "dips", kind: "remove_exercise" },
      ]);
      expect(data.plan).toEqual(planUpdate.plan);
    });

    it("answers 400 invalid_request for an id that isn't a uuid, without calling the services", async () => {
      const { calls, services } = answering(service, planUpdate);
      const { app, reported } = testApp({ services });

      const response = await send(
        app,
        method,
        "/v1/workout-sessions/not-a-uuid/plan-update"
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_request");
      expect(calls).toEqual([]);
      expect(reported).toEqual([]);
    });

    it("answers 401 without a token", async () => {
      const { app } = testApp();

      const response = await app.request(PATH, { method });

      expect(response.status).toBe(401);
    });
  }
);
