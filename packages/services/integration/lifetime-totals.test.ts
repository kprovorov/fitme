import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";

import {
  asUser,
  profiles,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import { afterAll, describe, expect, it } from "vitest";

import { getLifetimeTotals } from "../src/lifetime-totals";
import { updateProfile } from "../src/profile";
import { deleteTestUsers } from "./delete-test-users";

/**
 * getLifetimeTotals through asUser, against a local Supabase stack via the
 * Supavisor pooler as the fitme login. Made-up Clerk-style User ids, unique
 * per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const users: string[] = [];

const newUser = (name: string) => {
  const userId = `user_svcTotals${name}${runId}`;
  users.push(userId);

  return userId;
};

interface SeedSet {
  reps: number | null;
  weight: string | null;
}

interface SeedSession {
  finishedAt?: string;
  sets: SeedSet[];
  startedAt: string;
}

/** One Workout Session per entry, its sets under a single Exercise. */
const seedSessions = async (userId: string, sessions: SeedSession[]) =>
  await withService(async (tx) => {
    const rows = await tx
      .insert(workoutSessions)
      .values(
        sessions.map((session) => ({
          finishedAt: session.finishedAt,
          startedAt: session.startedAt,
          userId,
        }))
      )
      .returning({ id: workoutSessions.id });

    const withSets = sessions.flatMap((session, index) =>
      session.sets.length > 0 ? [{ id: rows[index].id, session }] : []
    );

    if (withSets.length === 0) {
      return;
    }

    const exercises = await tx
      .insert(workoutSessionExercises)
      .values(
        withSets.map(({ id }) => ({
          exerciseSlug: `test-totals-${runId}`,
          order: 1,
          workoutSessionId: id,
        }))
      )
      .returning({ id: workoutSessionExercises.id });

    await tx.insert(workoutSessionExerciseSets).values(
      withSets.flatMap(({ session }, exerciseIndex) =>
        session.sets.map((set, index) => ({
          loggedAt: set.reps === null ? null : session.startedAt,
          order: index + 1,
          repsCompleted: set.reps,
          weightCompleted: set.weight,
          workoutSessionExerciseId: exercises[exerciseIndex].id,
        }))
      )
    );
  });

const seedProfile = async (userId: string, system: "metric" | "us") =>
  await withService(async (tx) => {
    await tx.insert(profiles).values({
      age: 30,
      gender: "male",
      height: system === "metric" ? "180" : "71",
      measurementSystem: system,
      userId,
      weight: system === "metric" ? "80" : "176",
    });
  });

const totalsOf = async (userId: string) =>
  await asUser(userId, async (tx) => await getLifetimeTotals(tx, userId));

/** A User with two qualifying Workout Sessions among ones that don't count. */
const seedLifter = async (userId: string) => {
  await seedProfile(userId, "metric");
  await seedSessions(userId, [
    // 1 h: 100 × 5, a bodyweight set (no weight) and an unlogged set
    {
      finishedAt: "2026-10-01T11:00:00Z",
      sets: [
        { reps: 5, weight: "100" },
        { reps: 10, weight: null },
        { reps: null, weight: null },
      ],
      startedAt: "2026-10-01T10:00:00Z",
    },
    // 30 min: 62.5 × 8, and a weighted set logged with zero reps
    {
      finishedAt: "2026-10-03T10:30:00Z",
      sets: [
        { reps: 8, weight: "62.5" },
        { reps: 0, weight: "50" },
      ],
      startedAt: "2026-10-03T10:00:00Z",
    },
    // finished, but every set has zero reps
    {
      finishedAt: "2026-10-05T11:00:00Z",
      sets: [{ reps: 0, weight: "100" }],
      startedAt: "2026-10-05T10:00:00Z",
    },
    // finished with no Exercise at all
    {
      finishedAt: "2026-10-06T11:00:00Z",
      sets: [],
      startedAt: "2026-10-06T10:00:00Z",
    },
    // still open
    {
      sets: [{ reps: 10, weight: "100" }],
      startedAt: "2026-10-07T10:00:00Z",
    },
  ]);
};

describe(getLifetimeTotals, () => {
  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("counts only finished Workout Sessions with a set with positive reps", async () => {
    const lifter = newUser("Lifter");
    await seedLifter(lifter);

    await expect(totalsOf(lifter)).resolves.toStrictEqual({
      duration_seconds: 5400,
      volume: 1000,
      weight_unit: "kg",
      workout_count: 2,
    });
  });

  it("never counts another User's Workout Sessions", async () => {
    const lifter = newUser("Owner");
    const other = newUser("Other");
    await seedLifter(lifter);
    await seedSessions(other, [
      {
        finishedAt: "2026-10-02T12:00:00Z",
        sets: [{ reps: 3, weight: "200" }],
        startedAt: "2026-10-02T10:00:00Z",
      },
    ]);

    await expect(totalsOf(lifter)).resolves.toMatchObject({
      duration_seconds: 5400,
      volume: 1000,
      workout_count: 2,
    });
    await expect(totalsOf(other)).resolves.toStrictEqual({
      duration_seconds: 7200,
      volume: 600,
      weight_unit: "kg",
      workout_count: 1,
    });

    // RLS hides the other User's rows even when their id is asked for
    await expect(
      asUser(lifter, async (tx) => await getLifetimeTotals(tx, other))
    ).resolves.toMatchObject({ volume: 0, workout_count: 0 });
  });

  it("answers zeros in kg for a User with nothing that counts", async () => {
    const newcomer = newUser("Newcomer");
    await seedSessions(newcomer, [
      { sets: [{ reps: 5, weight: "100" }], startedAt: "2026-10-01T10:00:00Z" },
    ]);

    await expect(totalsOf(newcomer)).resolves.toStrictEqual({
      duration_seconds: 0,
      volume: 0,
      weight_unit: "kg",
      workout_count: 0,
    });
  });

  it("answers the volume in the converted unit after a measurement system switch", async () => {
    const switcher = newUser("Switcher");
    await seedProfile(switcher, "metric");
    await seedSessions(switcher, [
      {
        finishedAt: "2026-10-01T11:00:00Z",
        sets: [{ reps: 5, weight: "100" }],
        startedAt: "2026-10-01T10:00:00Z",
      },
    ]);

    await asUser(
      switcher,
      async (tx) =>
        await updateProfile(tx, switcher, { measurement_system: "us" })
    );

    const totals = await totalsOf(switcher);

    // 100 kg is stored as 220.46 lbs (two decimals), × 5 reps
    expect(totals).toStrictEqual({
      duration_seconds: 3600,
      volume: 1102.3,
      weight_unit: "lbs",
      workout_count: 1,
    });
  });

  it("holds off a conversion until its transaction ends", async () => {
    const reader = newUser("Reader");
    await seedProfile(reader, "metric");
    await seedSessions(reader, [
      {
        finishedAt: "2026-10-01T11:00:00Z",
        sets: [{ reps: 5, weight: "100" }],
        startedAt: "2026-10-01T10:00:00Z",
      },
    ]);

    const read = new EventTarget();
    const release = new EventTarget();
    const wasRead = once(read, "done");
    const released = once(release, "done");

    const reading = asUser(reader, async (tx) => {
      const totals = await getLifetimeTotals(tx, reader);
      read.dispatchEvent(new Event("done"));
      await released;

      return totals;
    });

    await wasRead;

    const conversion = asUser(
      reader,
      async (tx) =>
        await updateProfile(tx, reader, { measurement_system: "us" })
    );

    const pending = Symbol("pending");

    try {
      await expect(
        Promise.race([conversion, setTimeout(300, pending)])
      ).resolves.toBe(pending);
    } finally {
      // released whatever the outcome, so a failure never leaves the reading
      // transaction holding its lock
      release.dispatchEvent(new Event("done"));
    }

    await expect(reading).resolves.toMatchObject({
      volume: 500,
      weight_unit: "kg",
    });
    await conversion;
    await expect(totalsOf(reader)).resolves.toMatchObject({
      volume: 1102.3,
      weight_unit: "lbs",
    });
  });
});
