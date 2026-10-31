import { randomBytes } from "node:crypto";
import { asUser } from "@fitme/db";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan, type NewPlan } from "@fitme/services/plans";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * GET /v1/weekly-goals with the real services facade, through `asUser` on the
 * local stack's pooler, as made-up Clerk-style User ids: the Plan writes the
 * API serves record the Weekly goal, and only its own User reads it.
 */
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  identifyUser: () => undefined,
  reportError: (error) => Promise.reject(error),
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("goalOwner");
const intruder = testUserId("goalIntruder");

afterAll(async () => {
  await deleteTestUsers([owner, intruder]);
});

const newPlan = (frequency: number): NewPlan => ({
  description: "Weekly goal fixture",
  experience_level: "intermediate",
  frequency,
  goal: "muscle-gain",
  name: `${frequency} a week`,
  place: "gym",
  workout_duration: 60,
  workouts: [
    {
      description: "Day A",
      exercises: [
        {
          exercise_slug: "barbell-back-squat",
          sets: [
            {
              reps_recommended: 8,
              rest_recommended: 120,
              weight_recommended: 80,
            },
          ],
        },
      ],
      name: "Day A",
    },
  ],
});

const send = async (
  userId: string,
  method: string,
  path: string,
  body?: unknown
) => {
  const response = await app.request(path, {
    method,
    ...(body === undefined
      ? { headers: signedInAs(userId) }
      : {
          body: JSON.stringify(body),
          headers: {
            ...signedInAs(userId),
            "Content-Type": "application/json",
          },
        }),
  });
  return {
    body: response.status === 204 ? null : await response.json(),
    status: response.status,
  };
};

/** The answer's status and the targets in it, oldest first. */
const targets = async (userId: string) => {
  const { body, status } = await send(userId, "GET", "/v1/weekly-goals");
  return {
    status,
    targets: (body as { data: { target: number | null }[] }).data.map(
      (change) => change.target
    ),
  };
};

describe("GET /v1/weekly-goals", () => {
  it("follows the Plan writes the API serves, for their own User only", async () => {
    expect(await targets(owner)).toEqual({ status: 200, targets: [] });

    const first = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan(3))
    );
    const second = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan(5), { activate: false })
    );
    expect(await targets(owner)).toEqual({ status: 200, targets: [3] });

    expect(
      (await send(owner, "POST", `/v1/plans/${second.id}/activate`)).status
    ).toBe(200);
    expect(
      (await send(owner, "PATCH", `/v1/plans/${second.id}`, { frequency: 2 }))
        .status
    ).toBe(200);
    expect((await send(owner, "DELETE", `/v1/plans/${second.id}`)).status).toBe(
      204
    );
    expect(
      (await send(owner, "POST", `/v1/plans/${first.id}/activate`)).status
    ).toBe(200);

    expect(await targets(owner)).toEqual({
      status: 200,
      targets: [3, 5, 2, null, 3],
    });
    expect(await targets(intruder)).toEqual({ status: 200, targets: [] });
  });
});
