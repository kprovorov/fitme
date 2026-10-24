import { randomBytes } from "node:crypto";
import {
  plans,
  profiles,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workouts,
} from "@fitme/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * The app with the real services facade, through `asUser` on the local
 * stack's pooler (FITME_DATABASE_URL, set by the vitest config), as made-up
 * Clerk-style User ids with test-signed session tokens. Every query goes
 * through the same RLS policies as in production.
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

const withProfile = testUserId("profile");
const imperial = testUserId("imperial");
const withoutProfile = testUserId("noprofile");

/** The status and body of `GET /v1/profile` as `userId`. */
const getProfile = async (userId: string) => {
  const response = await app.request("/v1/profile", {
    headers: signedInAs(userId),
  });
  return { body: await response.json(), status: response.status };
};

beforeAll(async () => {
  await withService((tx) =>
    tx.insert(profiles).values([
      {
        age: 30,
        gender: "female",
        height: "170.5",
        measurementSystem: "metric",
        userId: withProfile,
        weight: "60.25",
      },
      {
        age: 41,
        gender: "male",
        height: "70",
        measurementSystem: "us",
        userId: imperial,
        weight: "180",
      },
    ])
  );
});

afterAll(async () => {
  await withService((tx) =>
    tx.delete(profiles).where(inArray(profiles.userId, [withProfile, imperial]))
  );
});

describe("GET /v1/profile against the local stack", () => {
  it("reads the signed-in User's Profile with its units", async () => {
    expect(await getProfile(withProfile)).toEqual({
      body: {
        data: {
          age: 30,
          gender: "female",
          height: 170.5,
          measurement_system: "metric",
          units: { height: "cm", weight: "kg" },
          weight: 60.25,
        },
      },
      status: 200,
    });
    expect(await getProfile(imperial)).toEqual({
      body: {
        data: {
          age: 41,
          gender: "male",
          height: 70,
          measurement_system: "us",
          units: { height: "in", weight: "lbs" },
          weight: 180,
        },
      },
      status: 200,
    });
  });

  it("answers { data: null } for a User without a Profile", async () => {
    expect(await getProfile(withoutProfile)).toEqual({
      body: { data: null },
      status: 200,
    });
  });

  it("never answers another User's Profile, whatever the request names", async () => {
    const response = await app.request(
      `/v1/profile?user_id=${withProfile}&userId=${withProfile}`,
      {
        headers: {
          ...signedInAs(withoutProfile),
          "x-user-id": withProfile,
        },
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: null });
  });
});

const editor = testUserId("editor");
const converter = testUserId("converter");
const ukConverter = testUserId("ukconverter");
const bystander = testUserId("bystander");
const editors = [editor, converter, ukConverter, bystander];

/** A metric User with a Profile and a Plan with one 60 kg set; the set's id. */
const seedMetricUser = (userId: string) =>
  withService(async (tx) => {
    await tx.insert(profiles).values({
      age: 30,
      gender: "female",
      height: "170",
      measurementSystem: "metric",
      userId,
      weight: "60",
    });
    const [plan] = await tx
      .insert(plans)
      .values({ frequency: 3, goal: "strength", place: "gym", userId })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({ description: "Push", name: "A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });
    const [workoutExercise] = await tx
      .insert(workoutExercises)
      .values({
        exerciseSlug: "barbell-back-squat",
        order: 1,
        workoutId: workout.id,
      })
      .returning({ id: workoutExercises.id });
    const [set] = await tx
      .insert(workoutExerciseSets)
      .values({
        order: 1,
        repsRecommended: 5,
        restRecommended: 120,
        weightRecommended: "60",
        workoutExerciseId: workoutExercise.id,
      })
      .returning({ id: workoutExerciseSets.id });
    return set.id;
  });

/** A Plan set's stored weight, read past RLS. */
const storedSetWeight = (setId: string) =>
  withService(async (tx) => {
    const [set] = await tx
      .select({ weight: workoutExerciseSets.weightRecommended })
      .from(workoutExerciseSets)
      .where(eq(workoutExerciseSets.id, setId));
    return set?.weight;
  });

/** The status and body of `PATCH /v1/profile` as `userId`. */
const patchProfile = async (userId: string, changes: unknown) => {
  const response = await app.request("/v1/profile", {
    body: JSON.stringify(changes),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method: "PATCH",
  });
  return { body: await response.json(), status: response.status };
};

describe("PATCH /v1/profile against the local stack", () => {
  let converterSet: string;
  let ukConverterSet: string;
  let bystanderSet: string;

  beforeAll(async () => {
    await seedMetricUser(editor);
    converterSet = await seedMetricUser(converter);
    ukConverterSet = await seedMetricUser(ukConverter);
    bystanderSet = await seedMetricUser(bystander);
  });

  afterAll(async () => {
    await withService(async (tx) => {
      // A Plan's Workouts, Exercises and sets cascade
      await tx.delete(plans).where(inArray(plans.userId, editors));
      await tx.delete(profiles).where(inArray(profiles.userId, editors));
    });
  });

  it("changes only the given field", async () => {
    expect(await patchProfile(editor, { age: 31 })).toEqual({
      body: {
        data: {
          age: 31,
          gender: "female",
          height: 170,
          measurement_system: "metric",
          units: { height: "cm", weight: "kg" },
          weight: 60,
        },
      },
      status: 200,
    });
    expect((await getProfile(editor)).body.data.age).toBe(31);
  });

  it("converts every stored height and weight to a new measurement system, and nobody else's", async () => {
    expect(await patchProfile(converter, { measurement_system: "us" })).toEqual(
      {
        body: {
          data: {
            age: 30,
            gender: "female",
            height: 66.93,
            measurement_system: "us",
            units: { height: "in", weight: "lbs" },
            weight: 132.28,
          },
        },
        status: 200,
      }
    );
    // 60 kg * 2.20462, rounded to 2 decimals
    expect(await storedSetWeight(converterSet)).toBe("132.28");

    expect((await getProfile(bystander)).body.data).toEqual({
      age: 30,
      gender: "female",
      height: 170,
      measurement_system: "metric",
      units: { height: "cm", weight: "kg" },
      weight: 60,
    });
    expect(await storedSetWeight(bystanderSet)).toBe("60.00");
  });

  it("writes a given height and weight in the new system's units", async () => {
    const { body } = await patchProfile(ukConverter, {
      height: 67.5,
      measurement_system: "uk",
      weight: 140,
    });

    expect(body.data).toMatchObject({
      height: 67.5,
      measurement_system: "uk",
      units: { height: "in", weight: "lbs" },
      weight: 140,
    });
    // The Plan's weights converted, the given ones written as they are
    expect(await storedSetWeight(ukConverterSet)).toBe("132.28");

    // us and uk share units: switching between them converts nothing again
    await patchProfile(ukConverter, { measurement_system: "us" });
    expect(await storedSetWeight(ukConverterSet)).toBe("132.28");
    expect((await getProfile(ukConverter)).body.data).toMatchObject({
      height: 67.5,
      weight: 140,
    });
  });

  it("answers 404 profile_not_found without a Profile, creating none", async () => {
    expect(await patchProfile(withoutProfile, { age: 31 })).toEqual({
      body: {
        error: { code: "profile_not_found", message: expect.any(String) },
      },
      status: 404,
    });
    expect(await getProfile(withoutProfile)).toEqual({
      body: { data: null },
      status: 200,
    });
  });
});
