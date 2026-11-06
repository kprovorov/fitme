import { randomBytes } from "node:crypto";

import {
  asUser,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan } from "@fitme/services/plans";
import type { NewPlan, PlanChanges } from "@fitme/services/plans";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

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
  identifyUser: () => {},
  reportError: Promise.reject.bind(Promise),
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("goalOwner");
const intruder = testUserId("goalIntruder");
const streakOwner = testUserId("streakOwner");

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
  body?: PlanChanges
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

  const { data } = z
    .object({ data: z.array(z.object({ target: z.number().nullable() })) })
    .parse(body);

  return {
    status,
    targets: data.map((change) => change.target),
  };
};

describe("gET /v1/weekly-goals", () => {
  afterAll(async () => {
    await deleteTestUsers([owner, intruder, streakOwner]);
  });

  it("reads a current-week streak through the real facade and keeps it User-owned", async () => {
    const created = await asUser(streakOwner, (tx) =>
      createPlan(tx, streakOwner, newPlan(1))
    );

    await withService(async (tx) => {
      const completedAt = new Date().toISOString();

      const [session] = await tx
        .insert(workoutSessions)
        .values({
          finishedAt: completedAt,
          planId: created.id,
          startedAt: completedAt,
          userId: streakOwner,
        })
        .returning();

      const [exercise] = await tx
        .insert(workoutSessionExercises)
        .values({
          exerciseSlug: "test-streak",
          order: 1,
          workoutSessionId: session.id,
        })
        .returning();

      await tx.insert(workoutSessionExerciseSets).values({
        order: 1,
        repsCompleted: 8,
        workoutSessionExerciseId: exercise.id,
      });
    });

    const responses = await Promise.all(
      ["Europe/Kyiv", "GMT+1", "GMT+05:30", "GMT-03:30", "UTC+12:45"].map(
        (zone) =>
          send(
            streakOwner,
            "GET",
            `/v1/weekly-goals?time_zone=${encodeURIComponent(zone)}`
          )
      )
    );

    for (const { body, status } of responses) {
      expect(status).toBe(200);
      expect(body).toMatchObject({ data: [{ target: 1 }], streak: 1 });
    }

    const intruderResponse = await send(
      intruder,
      "GET",
      "/v1/weekly-goals?time_zone=Europe%2FKyiv"
    );

    expect(intruderResponse.body).toStrictEqual({ data: [], streak: 0 });
  });

  it("follows the Plan writes the API serves, for their own User only", async () => {
    await expect(targets(owner)).resolves.toStrictEqual({
      status: 200,
      targets: [],
    });

    const first = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan(3))
    );

    const second = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan(5), { activate: false })
    );

    await expect(targets(owner)).resolves.toStrictEqual({
      status: 200,
      targets: [3],
    });

    const activated = await send(
      owner,
      "POST",
      `/v1/plans/${second.id}/activate`
    );

    const updated = await send(owner, "PATCH", `/v1/plans/${second.id}`, {
      frequency: 2,
    });

    const deleted = await send(owner, "DELETE", `/v1/plans/${second.id}`);

    const reactivated = await send(
      owner,
      "POST",
      `/v1/plans/${first.id}/activate`
    );

    expect(
      [activated, updated, deleted, reactivated].map(({ status }) => status)
    ).toStrictEqual([200, 200, 204, 200]);

    await expect(targets(owner)).resolves.toStrictEqual({
      status: 200,
      targets: [3, 5, 2, null, 3],
    });
    await expect(targets(intruder)).resolves.toStrictEqual({
      status: 200,
      targets: [],
    });
  });
});
