import { randomBytes } from "node:crypto";
import { asUser, plans, profiles, withService } from "@fitme/db";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import { createFakeLibrary, type FakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan } from "@fitme/services/plans";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, libraryExercise, signedInAs } from "../src/test/harness.js";

/**
 * POST /v1/plans with the real services facade, through `asUser` on the local
 * stack's pooler, and the fake Library.
 */
const library: FakeLibrary = createFakeLibrary(
  ["barbell-back-squat", "barbell-deadlift"].map(libraryExercise)
);
const reported: unknown[] = [];
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createLibrary: () => library,
  createServices: createServicesFromEnv,
  identifyUser: () => undefined,
  reportError: (error) => {
    reported.push(error);
    return Promise.resolve();
  },
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const creator = testUserId("creator");
const keeper = testUserId("keeper");
const refused = testUserId("refused");
const users = [creator, keeper, refused];

const newPlan = (name: string) => ({
  description: `${name} description`,
  experience_level: "intermediate",
  frequency: 3,
  goal: "muscle-gain",
  name,
  note: "Deload every fourth week",
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
            {
              reps_recommended: 6,
              rest_recommended: 150,
              weight_recommended: 90,
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

const post = async (userId: string, payload: unknown) => {
  const response = await app.request("/v1/plans", {
    body: JSON.stringify(payload),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method: "POST",
  });
  return { body: await response.json(), status: response.status };
};

const get = async (path: string, userId: string) => {
  const response = await app.request(path, { headers: signedInAs(userId) });
  return { body: await response.json(), status: response.status };
};

/** Every Plan row of the User, oldest first, deleted ones included. */
const plansOf = (userId: string) =>
  withService((tx) =>
    tx
      .select({ id: plans.id, isActive: plans.isActive, name: plans.name })
      .from(plans)
      .where(eq(plans.userId, userId))
      .orderBy(plans.createdAt, plans.id)
  );

beforeAll(async () => {
  await withService((tx) =>
    tx.insert(profiles).values({
      age: 41,
      gender: "male",
      height: "70",
      measurementSystem: "us",
      userId: creator,
      weight: "180",
    })
  );
});

beforeEach(() => {
  library.failWith(null);
  reported.length = 0;
});

afterAll(async () => {
  await deleteTestUsers(users);
});

describe("POST /v1/plans against the local stack", () => {
  it("creates the Plan in full, active, in the User's weight unit, and reads it back the same", async () => {
    const { body, status } = await post(creator, newPlan("Created"));

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      goal: "muscle-gain",
      is_active: true,
      name: "Created",
      note: "Deload every fourth week",
      weight_unit: "lbs",
    });
    expect(
      body.data.workouts.map(
        (workout: {
          exercises: {
            exercise_slug: string;
            order: number;
            sets: { order: number; weight_recommended: number }[];
          }[];
          name: string;
          order: number;
        }) => [
          workout.order,
          workout.name,
          workout.exercises.map((exercise) => [
            exercise.order,
            exercise.exercise_slug,
            exercise.sets.map((set) => [set.order, set.weight_recommended]),
          ]),
        ]
      )
    ).toEqual([
      [
        1,
        "Day A",
        [
          [
            1,
            "barbell-back-squat",
            [
              [1, 80.5],
              [2, 90],
            ],
          ],
          [2, "barbell-deadlift", [[1, 120]]],
        ],
      ],
      [2, "Day B", [[1, "barbell-deadlift", [[1, 0]]]]],
    ]);
    expect(await get(`/v1/plans/${body.data.id}`, creator)).toEqual({
      body,
      status: 200,
    });
    expect(await get("/v1/plans/active", creator)).toEqual({
      body,
      status: 200,
    });
    expect(reported).toEqual([]);
  });

  it("with activate: false, creates the Plan inactive and keeps the active Plan", async () => {
    const active = await asUser(keeper, (tx) =>
      createPlan(tx, keeper, newPlan("Active"))
    );

    const { body: created, status } = await post(keeper, {
      ...newPlan("Kept aside"),
      activate: false,
    });

    expect(status).toBe(201);
    expect(created.data.is_active).toBe(false);
    expect((await get("/v1/plans/active", keeper)).body.data.id).toBe(
      active.id
    );
    expect(await plansOf(keeper)).toEqual([
      { id: active.id, isActive: true, name: "Active" },
      { id: created.data.id, isActive: false, name: "Kept aside" },
    ]);
  });

  it("refuses unknown slugs with 400 unknown_exercises, writing nothing, unreported", async () => {
    const payload = newPlan("Unknown");
    payload.workouts[1].exercises[0].exercise_slug = "made-up-press";

    const { body: answer, status } = await post(refused, payload);

    expect(status).toBe(400);
    expect(answer.error).toEqual({
      code: "unknown_exercises",
      message: "Unknown exercise_slug(s): made-up-press",
    });
    expect(await plansOf(refused)).toEqual([]);
    expect(reported).toEqual([]);
  });

  it("answers a reported 503 exercise_library_unavailable during an outage, writing nothing", async () => {
    const outage = new LibraryUnavailableError();
    library.failWith(outage);

    const { body: answer, status } = await post(refused, newPlan("Outage"));

    expect(status).toBe(503);
    expect(answer.error.code).toBe("exercise_library_unavailable");
    expect(await plansOf(refused)).toEqual([]);
    expect(reported).toEqual([outage]);
  });
});
