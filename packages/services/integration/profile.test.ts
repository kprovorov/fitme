import { randomUUID } from "node:crypto";
import type { MeasurementSystem } from "@fitme/core/models";
import {
  asUser,
  exercises,
  plans,
  profiles,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getProfile, updateProfile } from "../src/profile";

/**
 * getProfile and updateProfile through asUser, against a local Supabase stack via the Supavisor
 * pooler as the fitme login. Made-up Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const metric = `user_svcProfMetric${runId}`;
const imperial = `user_svcProfUs${runId}`;
const noProfile = `user_svcProfNone${runId}`;

beforeAll(async () => {
  await withService((tx) =>
    tx.insert(profiles).values([
      {
        age: 30,
        gender: "female",
        height: "170.5",
        measurementSystem: "metric",
        userId: metric,
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
    tx.delete(profiles).where(inArray(profiles.userId, [metric, imperial]))
  );
});

describe("getProfile", () => {
  it("returns the User's own Profile with metric units", async () => {
    expect(await asUser(metric, (tx) => getProfile(tx, metric))).toEqual({
      age: 30,
      gender: "female",
      height: 170.5,
      measurement_system: "metric",
      units: { height: "cm", weight: "kg" },
      weight: 60.25,
    });
  });

  it("returns imperial units for the us measurement system", async () => {
    expect(await asUser(imperial, (tx) => getProfile(tx, imperial))).toEqual({
      age: 41,
      gender: "male",
      height: 70,
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
      weight: 180,
    });
  });

  it("never shows another User's Profile", async () => {
    expect(await asUser(metric, (tx) => getProfile(tx, imperial))).toBeNull();
  });

  it("returns null when the User has no Profile yet", async () => {
    expect(
      await asUser(noProfile, (tx) => getProfile(tx, noProfile))
    ).toBeNull();
  });
});

// ------------------------------------------------------------
// updateProfile
// ------------------------------------------------------------

const NUMERIC_OUT_OF_RANGE = "22003";

const updaters: string[] = [];
let exerciseId: string;

/** A fresh made-up User id for one test, cleaned up after the suite. */
const newUser = (label: string) => {
  const userId = `user_svcProfUpd${label}${runId}`;
  updaters.push(userId);
  return userId;
};

interface SeedOptions {
  height?: string;
  /** A Workout Session set's completed weight; numeric(8,2). */
  sessionWeightCompleted?: string;
  system: MeasurementSystem;
  weight?: string;
}

/**
 * A User with a Profile, a Plan with one set, a finished Workout Session of
 * that Plan's Workout with two sets (one not logged), and a Workout Session
 * whose Workout is gone.
 */
const seedUser = (
  userId: string,
  {
    height = "180",
    sessionWeightCompleted = "57.5",
    system,
    weight = "100",
  }: SeedOptions
) =>
  withService(async (tx) => {
    await tx.insert(profiles).values({
      age: 30,
      gender: "male",
      height,
      measurementSystem: system,
      userId,
      weight,
    });
    const [plan] = await tx
      .insert(plans)
      .values({ frequency: 3, goal: "strength", place: "gym", userId })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({ description: "Pull", name: "A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });
    const [workoutExercise] = await tx
      .insert(workoutExercises)
      .values({ exerciseId, order: 1, workoutId: workout.id })
      .returning({ id: workoutExercises.id });
    await tx.insert(workoutExerciseSets).values({
      order: 1,
      repsRecommended: 5,
      restRecommended: 120,
      weightRecommended: "60",
      workoutExerciseId: workoutExercise.id,
    });
    const sessions = await tx
      .insert(workoutSessions)
      .values([
        {
          finishedAt: "2026-10-01T01:00:00Z",
          planId: plan.id,
          startedAt: "2026-10-01T00:00:00Z",
          userId,
          workoutId: workout.id,
        },
        // Its Workout was recreated by a Plan update
        {
          finishedAt: "2026-09-01T01:00:00Z",
          planId: plan.id,
          startedAt: "2026-09-01T00:00:00Z",
          userId,
          workoutId: null,
        },
      ])
      .returning({ id: workoutSessions.id });
    const sessionExercises = await tx
      .insert(workoutSessionExercises)
      .values(
        sessions.map(({ id }) => ({
          exerciseId,
          order: 1,
          workoutSessionId: id,
        }))
      )
      .returning({ id: workoutSessionExercises.id });
    await tx.insert(workoutSessionExerciseSets).values(
      sessionExercises.flatMap(({ id }) => [
        {
          order: 1,
          weightCompleted: sessionWeightCompleted,
          weightRecommended: "60",
          workoutSessionExerciseId: id,
        },
        {
          order: 2,
          weightCompleted: null,
          weightRecommended: "62.5",
          workoutSessionExerciseId: id,
        },
      ])
    );
  });

/** Every stored height and weight of the User, read past RLS. */
const storedValues = (userId: string) =>
  withService(async (tx) => {
    const [profile] = await tx
      .select({
        age: profiles.age,
        gender: profiles.gender,
        height: profiles.height,
        measurementSystem: profiles.measurementSystem,
        weight: profiles.weight,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId));
    const planSets = await tx
      .select({ weightRecommended: workoutExerciseSets.weightRecommended })
      .from(workoutExerciseSets)
      .innerJoin(
        workoutExercises,
        eq(workoutExercises.id, workoutExerciseSets.workoutExerciseId)
      )
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .innerJoin(plans, eq(plans.id, workouts.planId))
      .where(eq(plans.userId, userId));
    const sessionSets = await tx
      .select({
        linked: sql<boolean>`${workoutSessions.workoutId} is not null`,
        weightCompleted: workoutSessionExerciseSets.weightCompleted,
        weightRecommended: workoutSessionExerciseSets.weightRecommended,
      })
      .from(workoutSessionExerciseSets)
      .innerJoin(
        workoutSessionExercises,
        eq(
          workoutSessionExercises.id,
          workoutSessionExerciseSets.workoutSessionExerciseId
        )
      )
      .innerJoin(
        workoutSessions,
        eq(workoutSessions.id, workoutSessionExercises.workoutSessionId)
      )
      .where(eq(workoutSessions.userId, userId))
      .orderBy(
        asc(workoutSessions.startedAt),
        workoutSessionExerciseSets.order
      );
    return { planSets, profile, sessionSets };
  });

/** The `convert_measurement_system` RPC, as the mobile app calls it. */
const convertThroughRpc = (userId: string, system: MeasurementSystem) =>
  asUser(userId, (tx) =>
    tx.execute(sql`select public.convert_measurement_system(${system})`)
  );

const update = (userId: string, changes: Parameters<typeof updateProfile>[2]) =>
  asUser(userId, (tx) => updateProfile(tx, userId, changes));

beforeAll(async () => {
  const [exercise] = await withService((tx) =>
    tx
      .insert(exercises)
      .values({ name: "Test row", slug: `test-row-profile-${runId}` })
      .returning({ id: exercises.id })
  );
  exerciseId = exercise.id;
});

afterAll(async () => {
  await withService(async (tx) => {
    await tx
      .delete(workoutSessions)
      .where(inArray(workoutSessions.userId, updaters));
    await tx.delete(plans).where(inArray(plans.userId, updaters));
    await tx.delete(profiles).where(inArray(profiles.userId, updaters));
    await tx.delete(exercises).where(eq(exercises.id, exerciseId));
  });
});

describe("updateProfile", () => {
  it("changes only the given fields and returns the Profile", async () => {
    const userId = newUser("Fields");
    await seedUser(userId, { system: "metric" });
    const before = await storedValues(userId);

    expect(await update(userId, { age: 31, weight: 98.5 })).toEqual({
      age: 31,
      gender: "male",
      height: 180,
      measurement_system: "metric",
      units: { height: "cm", weight: "kg" },
      weight: 98.5,
    });
    expect(
      await update(userId, { gender: "female", height: 181.25 })
    ).toMatchObject({ gender: "female", height: 181.25 });

    const after = await storedValues(userId);
    expect(after.profile).toEqual({
      age: 31,
      gender: "female",
      height: "181.25",
      measurementSystem: "metric",
      weight: "98.50",
    });
    expect(after.planSets).toEqual(before.planSets);
    expect(after.sessionSets).toEqual(before.sessionSets);
  });

  it("returns the Profile unchanged when nothing is given", async () => {
    const userId = newUser("Nothing");
    await seedUser(userId, { system: "us" });

    expect(await update(userId, {})).toMatchObject({
      measurement_system: "us",
      weight: 100,
    });
  });

  it("converts every stored weight from metric to us", async () => {
    const userId = newUser("MetricUs");
    await seedUser(userId, { system: "metric" });

    expect(await update(userId, { measurement_system: "us" })).toEqual({
      age: 30,
      gender: "male",
      height: 70.87,
      measurement_system: "us",
      units: { height: "in", weight: "lbs" },
      weight: 220.46,
    });
    expect(await storedValues(userId)).toEqual({
      planSets: [{ weightRecommended: "132.28" }],
      profile: expect.objectContaining({
        height: "70.87",
        measurementSystem: "us",
        weight: "220.46",
      }),
      sessionSets: [
        // Reached only through its (gone) Workout, so the RPC skips it too
        { linked: false, weightCompleted: "57.50", weightRecommended: "60.00" },
        { linked: false, weightCompleted: null, weightRecommended: "62.50" },
        {
          linked: true,
          weightCompleted: "126.77",
          weightRecommended: "132.28",
        },
        { linked: true, weightCompleted: null, weightRecommended: "137.79" },
      ],
    });
  });

  for (const [from, to] of [
    ["metric", "us"],
    ["metric", "uk"],
    ["us", "metric"],
    ["uk", "metric"],
    ["us", "uk"],
    ["uk", "us"],
    ["metric", "metric"],
    ["us", "us"],
  ] as const) {
    it(`converts ${from} -> ${to} exactly as convert_measurement_system does`, async () => {
      const throughService = newUser(`Svc${from}${to}`);
      const throughRpc = newUser(`Rpc${from}${to}`);
      const seed = { height: "70.5", system: from, weight: "181.37" };
      await seedUser(throughService, seed);
      await seedUser(throughRpc, seed);

      await update(throughService, { measurement_system: to });
      await convertThroughRpc(throughRpc, to);

      const converted = await storedValues(throughService);
      expect(converted).toEqual(await storedValues(throughRpc));
      expect(converted.profile?.measurementSystem).toBe(to);
    });
  }

  it("converts an unknown stored system as imperial, like the RPC", async () => {
    const throughService = newUser("SvcUnknown");
    const throughRpc = newUser("RpcUnknown");
    const seed = { system: "imperial" as MeasurementSystem, weight: "181.37" };
    await seedUser(throughService, seed);
    await seedUser(throughRpc, seed);

    await update(throughService, { measurement_system: "metric" });
    await convertThroughRpc(throughRpc, "metric");

    const converted = await storedValues(throughService);
    expect(converted).toEqual(await storedValues(throughRpc));
    expect(converted.profile?.weight).toBe("82.27");
  });

  it("writes the given weight and height in the new system's units", async () => {
    const userId = newUser("ChangeAndSet");
    await seedUser(userId, { system: "metric" });

    expect(
      await update(userId, { measurement_system: "us", weight: 200 })
    ).toMatchObject({ height: 70.87, measurement_system: "us", weight: 200 });
    expect((await storedValues(userId)).planSets).toEqual([
      { weightRecommended: "132.28" },
    ]);
  });

  it("gives the same result when the same update runs twice", async () => {
    const userId = newUser("Twice");
    await seedUser(userId, { system: "metric" });
    const changes = { age: 32, measurement_system: "uk", weight: 200 } as const;

    const first = await update(userId, changes);
    const afterFirst = await storedValues(userId);
    const second = await update(userId, changes);

    expect(second).toEqual(first);
    expect(await storedValues(userId)).toEqual(afterFirst);
  });

  it("converts once when two conversions run at the same time", async () => {
    const userId = newUser("Concurrent");
    await seedUser(userId, { system: "metric" });

    await Promise.all([
      update(userId, { measurement_system: "us" }),
      update(userId, { measurement_system: "us" }),
    ]);

    expect(await storedValues(userId)).toMatchObject({
      planSets: [{ weightRecommended: "132.28" }],
      profile: { measurementSystem: "us", weight: "220.46" },
    });
  });

  it("leaves everything unchanged when a conversion fails partway", async () => {
    const userId = newUser("Overflow");
    // Past numeric(8,2) once converted, after the Profile and Plan sets were
    await seedUser(userId, {
      sessionWeightCompleted: "500000",
      system: "metric",
    });
    const before = await storedValues(userId);

    await expect(
      update(userId, { measurement_system: "us" })
    ).rejects.toMatchObject({ cause: { code: NUMERIC_OUT_OF_RANGE } });

    expect(await storedValues(userId)).toEqual(before);
  });

  it("leaves the conversion undone when a field write fails after it", async () => {
    const userId = newUser("FieldOverflow");
    await seedUser(userId, { system: "metric" });
    const before = await storedValues(userId);

    await expect(
      update(userId, { measurement_system: "us", weight: 10_000_000 })
    ).rejects.toMatchObject({ cause: { code: NUMERIC_OUT_OF_RANGE } });

    expect(await storedValues(userId)).toEqual(before);
  });

  it("rejects an unknown measurement system without changing anything", async () => {
    const userId = newUser("Invalid");
    await seedUser(userId, { system: "metric" });
    const before = await storedValues(userId);

    await expect(
      update(userId, {
        measurement_system: "imperial" as MeasurementSystem,
        weight: 1,
      })
    ).rejects.toThrow("Invalid measurement system: imperial");
    expect(await storedValues(userId)).toEqual(before);
  });

  it("returns null without a Profile", async () => {
    const userId = newUser("NoProfile");

    expect(await update(userId, { measurement_system: "us" })).toBeNull();
    expect((await storedValues(userId)).profile).toBeUndefined();
  });

  it("never touches another User's Profile or weights", async () => {
    const userId = newUser("Self");
    const other = newUser("Other");
    await seedUser(userId, { system: "metric" });
    await seedUser(other, { system: "metric" });
    const otherBefore = await storedValues(other);

    // Even when handed another User's id, RLS keeps the caller to their own rows
    expect(
      await asUser(userId, (tx) =>
        updateProfile(tx, other, { measurement_system: "us", weight: 1 })
      )
    ).toBeNull();
    await update(userId, { measurement_system: "us" });

    expect(await storedValues(other)).toEqual(otherBefore);
    expect((await storedValues(userId)).profile?.measurementSystem).toBe("us");
  });
});
