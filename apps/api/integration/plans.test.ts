import { randomBytes, randomUUID } from "node:crypto";
import { asUser, profiles, withService } from "@fitme/db";
import { deleteUserData } from "@fitme/services/delete-user-data";
import {
  createPlan,
  deletePlan,
  type NewPlan,
  type PlanDetail,
} from "@fitme/services/plans";
import { updateProfile } from "@fitme/services/profile";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * The app with the real services facade, through `asUser` on the local
 * stack's pooler (FITME_DATABASE_URL, set by the vitest config), as made-up
 * Clerk-style User ids with test-signed session tokens. Plans are seeded
 * through the services as each User, so RLS applies to the seeding too.
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

const metric = testUserId("metric");
const imperial = testUserId("imperial");
const noProfile = testUserId("noprofile");
const noPlans = testUserId("noplans");
const converting = testUserId("converting");
const users = [metric, imperial, noProfile, noPlans, converting];

/** A Plan of two Workouts. */
const newPlan = (name: string): NewPlan => ({
  description: `${name} description`,
  experience_level: "intermediate",
  frequency: 3,
  goal: "build_muscle",
  name,
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
              weight_recommended: 100,
            },
          ],
        },
      ],
      name: "Day B",
    },
  ],
});

const seedPlan = (userId: string, name: string) =>
  asUser(userId, (tx) => createPlan(tx, userId, newPlan(name)));

/** How long the conversion test keeps its conversion uncommitted. */
const CONVERSION_HOLD_MS = 1000;

/** A field of the services' answer the contract never shows. */
const LEGACY_OR_INTERNAL_FIELD =
  /"(exercise_id|exercise|deleted_at|request_key|user_id)"/;

/** The status and body of a GET as `userId`. */
const get = async (path: string, userId: string) => {
  const response = await app.request(path, { headers: signedInAs(userId) });
  return { body: await response.json(), status: response.status };
};

let older: PlanDetail;
let active: PlanDetail;
let deleted: PlanDetail;
let imperialPlan: PlanDetail;
let noProfilePlan: PlanDetail;
let convertingPlan: PlanDetail;

beforeAll(async () => {
  await withService((tx) =>
    tx.insert(profiles).values([
      {
        age: 30,
        gender: "female",
        height: "170",
        measurementSystem: "metric",
        userId: metric,
        weight: "60",
      },
      {
        age: 41,
        gender: "male",
        height: "70",
        measurementSystem: "us",
        userId: imperial,
        weight: "180",
      },
      {
        age: 35,
        gender: "female",
        height: "65",
        measurementSystem: "us",
        userId: converting,
        weight: "140",
      },
    ])
  );
  older = await seedPlan(metric, "Older");
  deleted = await seedPlan(metric, "Deleted");
  await asUser(metric, (tx) => deletePlan(tx, metric, deleted.id));
  // Created last, so it's the newest and (createPlan activates) the active one
  active = await seedPlan(metric, "Active");
  imperialPlan = await seedPlan(imperial, "Imperial");
  noProfilePlan = await seedPlan(noProfile, "No Profile");
  convertingPlan = await seedPlan(converting, "Converting");
});

afterAll(async () => {
  // One transaction each, so they may run side by side
  await Promise.all(
    users.map((userId) => withService((tx) => deleteUserData(tx, userId)))
  );
});

/** The Plan as the contract shows it: Exercises by slug only. */
const expected = (plan: PlanDetail, weightUnit: "kg" | "lbs") => ({
  ...plan,
  weight_unit: weightUnit,
  workouts: plan.workouts.map((workout) => ({
    ...workout,
    exercises: workout.exercises.map(({ exercise_slug, id, order, sets }) => ({
      exercise_slug,
      id,
      order,
      sets,
    })),
  })),
});

describe("GET /v1/plans against the local stack", () => {
  it("lists the User's live Plans newest first with Workout summaries", async () => {
    const { body, status } = await get("/v1/plans", metric);

    expect(status).toBe(200);
    expect(
      body.data.map((plan: { id: string; is_active: boolean }) => [
        plan.id,
        plan.is_active,
      ])
    ).toEqual([
      [active.id, true],
      [older.id, false],
    ]);
    expect(body.data[0].workouts).toEqual([
      {
        exercise_count: 2,
        id: active.workouts[0]?.id,
        name: "Day A",
        order: 1,
      },
      {
        exercise_count: 1,
        id: active.workouts[1]?.id,
        name: "Day B",
        order: 2,
      },
    ]);
  });

  it("answers an empty list for a User without Plans", async () => {
    expect(await get("/v1/plans", noPlans)).toEqual({
      body: { data: [] },
      status: 200,
    });
  });
});

describe("GET /v1/plans/{id} against the local stack", () => {
  it("reads a Plan in full, in order, Exercises by slug only, in kg for metric", async () => {
    const { body, status } = await get(`/v1/plans/${older.id}`, metric);

    expect(status).toBe(200);
    expect(body).toEqual({
      data: expected({ ...older, is_active: false }, "kg"),
    });
    expect(
      body.data.workouts[0].exercises.map(
        (exercise: { exercise_slug: string; sets: { order: number }[] }) => [
          exercise.exercise_slug,
          exercise.sets.map((set) => set.order),
        ]
      )
    ).toEqual([
      ["barbell-back-squat", [1, 2]],
      ["barbell-deadlift", [1]],
    ]);
    expect(JSON.stringify(body)).not.toMatch(LEGACY_OR_INTERNAL_FIELD);
  });

  it("says lbs for a us Profile and kg without a Profile, weights as stored", async () => {
    const imperialRead = await get(`/v1/plans/${imperialPlan.id}`, imperial);
    expect(imperialRead.body).toEqual({ data: expected(imperialPlan, "lbs") });
    expect(
      imperialRead.body.data.workouts[0].exercises[0].sets[0].weight_recommended
    ).toBe(80.5);

    const noProfileRead = await get(`/v1/plans/${noProfilePlan.id}`, noProfile);
    expect(noProfileRead.body).toEqual({ data: expected(noProfilePlan, "kg") });
  });

  it("answers 404 for a soft-deleted or missing Plan", async () => {
    const reads = await Promise.all(
      [deleted.id, randomUUID()].map((id) => get(`/v1/plans/${id}`, metric))
    );
    for (const { body, status } of reads) {
      expect(status).toBe(404);
      expect(body.error.code).toBe("not_found");
    }
  });

  it("answers 400 for a malformed id", async () => {
    const { body, status } = await get("/v1/plans/1", metric);
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
  });
});

describe("GET /v1/plans/active against the local stack", () => {
  it("reads the active Plan in full", async () => {
    expect(await get("/v1/plans/active", metric)).toEqual({
      body: { data: expected(active, "kg") },
      status: 200,
    });
  });

  it("answers { data: null } without an active Plan", async () => {
    expect(await get("/v1/plans/active", noPlans)).toEqual({
      body: { data: null },
      status: 200,
    });
  });
});

describe("Plans across Users", () => {
  it("never shows another User's Plan, by id, in the list or as active", async () => {
    const byId = await get(`/v1/plans/${active.id}`, imperial);
    expect(byId.status).toBe(404);
    expect(byId.body.error.code).toBe("not_found");

    const list = await get("/v1/plans", imperial);
    expect(list.body.data.map((plan: { id: string }) => plan.id)).toEqual([
      imperialPlan.id,
    ]);

    expect((await get("/v1/plans/active", imperial)).body.data.id).toBe(
      imperialPlan.id
    );
    expect((await get("/v1/plans/active", noPlans)).body).toEqual({
      data: null,
    });
  });
});

describe("A Plan read during a measurement-system conversion", () => {
  it("waits for the conversion, then answers its weights in the new unit", async () => {
    let read: ReturnType<typeof get> | undefined;
    let answered = false;
    let answeredBeforeCommit = false;
    await asUser(converting, async (tx) => {
      // us → metric: 80.5 and 90 lbs are stored as 36.51 and 40.82 kg once this commits
      await updateProfile(tx, converting, { measurement_system: "metric" });
      read = get(`/v1/plans/${convertingPlan.id}`, converting);
      read.then(() => {
        answered = true;
      });
      await new Promise((resolve) => setTimeout(resolve, CONVERSION_HOLD_MS));
      answeredBeforeCommit = answered;
    });
    const { body, status } = await (read as ReturnType<typeof get>);

    expect(answeredBeforeCommit).toBe(false);
    expect(status).toBe(200);
    expect(body.data.weight_unit).toBe("kg");
    expect(
      body.data.workouts[0].exercises[0].sets.map(
        (set: { weight_recommended: number }) => set.weight_recommended
      )
    ).toEqual([36.51, 40.82]);
  });
});
