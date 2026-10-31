import { randomUUID } from "node:crypto";
import {
  asUser,
  personalRecords,
  plans,
  profiles,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteUserData } from "../src/delete-user-data";
import { updateProfile } from "../src/profile";
import {
  finishWorkoutSession,
  listWorkoutSessions,
  logSet,
} from "../src/workout-sessions";
import { deleteTestUsers, withUserTablesLocked } from "./delete-test-users";

/**
 * Personal records awarded by finishWorkoutSession (ADR 0015), through
 * asUser, against a local Supabase stack via the Supavisor pooler as the
 * fitme login. Made-up Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const users: string[] = [];
let owner = "";
/** A fresh User per test: records compare against all of a User's History. */
const newUser = (name: string) => {
  const userId = `user_svcPr${name}${runId}${users.length}`;
  users.push(userId);
  return userId;
};
beforeEach(() => {
  owner = newUser("Owner");
});

afterAll(async () => {
  await deleteTestUsers(users);
});

const SQUAT = "barbell-back-squat";
const PULL_UP = "pull-up";

/** A set as logged: `[weight, reps]`, either one `null` when not entered. */
type LoggedSet = [weight: number | null, reps: number | null];

interface SessionSeed {
  exercises: Record<string, LoggedSet[]>;
  /** Finished an hour after it started; open when `false`. */
  finished?: boolean;
  planId?: string | null;
  startedAt?: string;
  userId?: string;
}

/** A Workout Session of the User with its sets logged as given. */
const seedSession = ({
  exercises,
  finished = true,
  planId = null,
  startedAt = "2026-10-01T10:00:00Z",
  userId = owner,
}: SessionSeed) =>
  withService(async (tx) => {
    const started = new Date(startedAt);
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        finishedAt: finished
          ? new Date(started.getTime() + 3_600_000).toISOString()
          : null,
        planId,
        startedAt,
        userId,
      })
      .returning({ id: workoutSessions.id });
    let order = 0;
    for (const [exerciseSlug, sets] of Object.entries(exercises)) {
      order += 1;
      // biome-ignore lint/performance/noAwaitInLoops: one transaction, one query at a time
      const [exercise] = await tx
        .insert(workoutSessionExercises)
        .values({ exerciseSlug, order, workoutSessionId: session.id })
        .returning({ id: workoutSessionExercises.id });
      if (sets.length > 0) {
        await tx.insert(workoutSessionExerciseSets).values(
          sets.map(([weight, reps], index) => ({
            loggedAt: started.toISOString(),
            order: index + 1,
            repsCompleted: reps,
            weightCompleted: weight === null ? null : String(weight),
            workoutSessionExerciseId: exercise.id,
          }))
        );
      }
    }
    return session.id;
  });

const finish = (sessionId: string, userId = owner) =>
  asUser(userId, (tx) => finishWorkoutSession(tx, sessionId));

/** The records History shows for a Workout Session of the User. */
const recordsOf = async (sessionId: string, userId = owner) => {
  const page = await asUser(userId, (tx) =>
    listWorkoutSessions(tx, { limit: 50, offset: 0, status: "all" })
  );
  return page.sessions.find(({ id }) => id === sessionId)?.personal_records;
};

/** Seeds an open Workout Session, finishes it, and answers its records. */
const finishWith = async (seed: SessionSeed) => {
  const sessionId = await seedSession({
    finished: false,
    startedAt: "2026-10-20T10:00:00Z",
    ...seed,
  });
  await finish(sessionId, seed.userId);
  return { records: await recordsOf(sessionId, seed.userId), sessionId };
};

describe("finishWorkoutSession's Personal records", () => {
  it("sets a baseline with the first usable results, earning none even for competing sets", async () => {
    const { records } = await finishWith({
      exercises: {
        [SQUAT]: [
          [100, 5],
          [110, 3],
          [110, 4],
        ],
      },
    });
    expect(records).toEqual([]);
  });

  it("earns a weight record for a higher weight than any earlier result, from every Plan and all History", async () => {
    const [planA, planB] = await withService((tx) =>
      tx
        .insert(plans)
        .values(
          ["A", "B"].map((name) => ({
            frequency: 3,
            goal: "strength",
            name,
            place: "gym",
            userId: owner,
          }))
        )
        .returning({ id: plans.id })
    );
    // A year ago, on another Plan: the record to beat
    await seedSession({
      exercises: { [SQUAT]: [[120, 3]] },
      planId: planA.id,
      startedAt: "2025-09-01T10:00:00Z",
    });
    await seedSession({
      exercises: { [SQUAT]: [[100, 5]] },
      planId: planB.id,
      startedAt: "2026-10-10T10:00:00Z",
    });

    expect(
      (
        await finishWith({
          exercises: { [SQUAT]: [[110, 8]] },
          planId: planB.id,
        })
      ).records
    ).toEqual([]);
    expect(
      (
        await finishWith({
          exercises: {
            [SQUAT]: [
              [115, 2],
              [122.5, 1],
            ],
          },
          planId: planB.id,
          startedAt: "2026-10-21T10:00:00Z",
        })
      ).records
    ).toEqual([
      { exercise_slug: SQUAT, kind: "weight", reps: 1, weight: 122.5 },
    ]);
  });

  it("earns a reps record for more reps at the earlier highest weight, never for more reps at a lower one", async () => {
    await seedSession({
      exercises: {
        [SQUAT]: [
          [100, 5],
          [80, 12],
        ],
      },
    });

    expect(
      (
        await finishWith({
          exercises: {
            [SQUAT]: [
              [90, 20],
              [100, 4],
            ],
          },
        })
      ).records
    ).toEqual([]);
    expect(
      (
        await finishWith({
          exercises: { [SQUAT]: [[100, 6]] },
          startedAt: "2026-10-21T10:00:00Z",
        })
      ).records
    ).toEqual([{ exercise_slug: SQUAT, kind: "reps", reps: 6, weight: 100 }]);
  });

  it("earns nothing for an exact tie", async () => {
    await seedSession({ exercises: { [SQUAT]: [[100, 5]] } });
    expect(
      (await finishWith({ exercises: { [SQUAT]: [[100, 5]] } })).records
    ).toEqual([]);
  });

  it("awards one record per Exercise that beat its own results", async () => {
    await seedSession({
      exercises: { [PULL_UP]: [[0, 8]], [SQUAT]: [[100, 5]] },
    });
    expect(
      (
        await finishWith({
          exercises: { [PULL_UP]: [[0, 10]], [SQUAT]: [[100, 5]] },
        })
      ).records
    ).toEqual([{ exercise_slug: PULL_UP, kind: "reps", reps: 10, weight: 0 }]);
  });

  it("lets an explicit zero weight earn rep records, but never a missing weight or zero reps", async () => {
    // Missing weights are no evidence: the zero-weight session is the baseline
    await seedSession({ exercises: { [PULL_UP]: [[null, 15]] } });
    expect(
      (
        await finishWith({
          exercises: { [PULL_UP]: [[0, 8]] },
          startedAt: "2026-10-11T10:00:00Z",
        })
      ).records
    ).toEqual([]);

    expect(
      (
        await finishWith({
          exercises: {
            [PULL_UP]: [
              [null, 30],
              [5, 0],
              [5, null],
            ],
          },
          startedAt: "2026-10-12T10:00:00Z",
        })
      ).records
    ).toEqual([]);

    expect(
      (
        await finishWith({
          exercises: { [PULL_UP]: [[0, 9]] },
          startedAt: "2026-10-13T10:00:00Z",
        })
      ).records
    ).toEqual([{ exercise_slug: PULL_UP, kind: "reps", reps: 9, weight: 0 }]);
  });

  it("never lets bodyweight reps beat a weighted result", async () => {
    await seedSession({
      exercises: {
        [PULL_UP]: [
          [0, 12],
          [10, 5],
        ],
      },
    });
    expect(
      (await finishWith({ exercises: { [PULL_UP]: [[0, 30]] } })).records
    ).toEqual([]);
  });

  it("compares only with finished Workout Sessions of the same User", async () => {
    const other = newUser("Other");
    await seedSession({
      exercises: { [SQUAT]: [[300, 10]] },
      userId: other,
    });
    await seedSession({ exercises: { [SQUAT]: [[100, 5]] } });

    const { records, sessionId } = await finishWith({
      exercises: { [SQUAT]: [[105, 5]] },
    });
    expect(records).toEqual([
      { exercise_slug: SQUAT, kind: "weight", reps: 5, weight: 105 },
    ]);
    // Another User sees neither the session nor its records
    expect(await recordsOf(sessionId, other)).toBeUndefined();
    expect(
      await asUser(other, (tx) =>
        tx
          .select({ id: personalRecords.id })
          .from(personalRecords)
          .where(eq(personalRecords.workoutSessionId, sessionId))
      )
    ).toEqual([]);
  });

  it("awards once however often the finish is repeated, concurrently or not", async () => {
    await seedSession({ exercises: { [SQUAT]: [[100, 5]] } });
    const sessionId = await seedSession({
      exercises: { [SQUAT]: [[110, 5]] },
      finished: false,
      startedAt: "2026-10-20T10:00:00Z",
    });

    const results = await Promise.all([finish(sessionId), finish(sessionId)]);
    expect(
      results.map((result) =>
        result.status === "finished" ? result.alreadyFinished : result.status
      )
    ).toEqual(expect.arrayContaining([false, true]));
    await finish(sessionId);

    expect(await recordsOf(sessionId)).toEqual([
      { exercise_slug: SQUAT, kind: "weight", reps: 5, weight: 110 },
    ]);
  });

  it("never compares a Workout Session with itself, so a repeated finish keeps the baseline", async () => {
    const sessionId = await seedSession({
      exercises: { [SQUAT]: [[100, 5]] },
      finished: false,
    });
    await finish(sessionId);
    await finish(sessionId);
    expect(await recordsOf(sessionId)).toEqual([]);

    // The baseline is still 100 × 5: a tie earns nothing, one more rep does
    expect(
      (
        await finishWith({
          exercises: { [SQUAT]: [[100, 5]] },
          startedAt: "2026-10-21T10:00:00Z",
        })
      ).records
    ).toEqual([]);
    expect(
      (
        await finishWith({
          exercises: { [SQUAT]: [[100, 6]] },
          startedAt: "2026-10-22T10:00:00Z",
        })
      ).records
    ).toEqual([{ exercise_slug: SQUAT, kind: "reps", reps: 6, weight: 100 }]);
  });

  it("keeps earned records through measurement-system changes, converted and rounded, never adding one", async () => {
    await withService((tx) =>
      tx.insert(profiles).values({
        age: 30,
        gender: "male",
        height: "180",
        measurementSystem: "metric",
        userId: owner,
        weight: "80",
      })
    );
    await seedSession({ exercises: { [SQUAT]: [[100, 5]] } });
    const { sessionId } = await finishWith({
      exercises: { [SQUAT]: [[100.5, 5]] },
    });

    await asUser(owner, (tx) =>
      updateProfile(tx, owner, { measurement_system: "us" })
    );
    // 100.5 kg × 2.20462, rounded to 2 decimals
    expect(await recordsOf(sessionId)).toEqual([
      { exercise_slug: SQUAT, kind: "weight", reps: 5, weight: 221.56 },
    ]);

    await asUser(owner, (tx) =>
      updateProfile(tx, owner, { measurement_system: "metric" })
    );
    expect(await recordsOf(sessionId)).toEqual([
      { exercise_slug: SQUAT, kind: "weight", reps: 5, weight: 100.5 },
    ]);

    // Every earlier result converted the same way: the same set is a tie
    expect(
      (
        await finishWith({
          exercises: { [SQUAT]: [[100.5, 5]] },
          startedAt: "2026-10-21T10:00:00Z",
        })
      ).records
    ).toEqual([]);
    expect(
      await withService((tx) =>
        tx.$count(personalRecords, eq(personalRecords.userId, owner))
      )
    ).toBe(1);
  });

  it("is deleted with the User's data", async () => {
    await seedSession({ exercises: { [SQUAT]: [[100, 5]] } });
    await finishWith({ exercises: { [SQUAT]: [[105, 5]] } });
    const countRecords = () =>
      withService((tx) =>
        tx.$count(personalRecords, eq(personalRecords.userId, owner))
      );
    expect(await countRecords()).toBe(1);

    await withUserTablesLocked((tx) => deleteUserData(tx, owner));

    expect(await countRecords()).toBe(0);
  });

  it("includes a log that is committing while the Workout Session finishes", async () => {
    await seedSession({ exercises: { [SQUAT]: [[100, 5]] } });
    const sessionId = await seedSession({
      exercises: { [SQUAT]: [[90, 5]] },
      finished: false,
    });
    const [set] = await asUser(owner, (tx) =>
      tx
        .select({ id: workoutSessionExerciseSets.id })
        .from(workoutSessionExerciseSets)
        .innerJoin(
          workoutSessionExercises,
          eq(
            workoutSessionExercises.id,
            workoutSessionExerciseSets.workoutSessionExerciseId
          )
        )
        .where(eq(workoutSessionExercises.workoutSessionId, sessionId))
    );
    let release: () => void = () => undefined;
    let logged: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      logged = resolve;
    });
    const logging = asUser(owner, async (tx) => {
      const result = await logSet(tx, {
        repsCompleted: 5,
        setId: set.id,
        weightCompleted: 110,
      });
      logged();
      await gate;
      return result;
    });
    await ready;
    const finishing = finish(sessionId);
    try {
      // Give a finish that does not serialize with the log time to read the
      // previously committed set. Correct finishes wait for the log's commit.
      await Promise.race([
        finishing,
        new Promise((resolve) => setTimeout(resolve, 250)),
      ]);
    } finally {
      release();
    }
    expect((await logging).status).toBe("logged");
    expect((await finishing).status).toBe("finished");
    expect(await recordsOf(sessionId)).toEqual([
      { exercise_slug: SQUAT, kind: "weight", reps: 5, weight: 110 },
    ]);
  });

  it("does not turn an imperial tie into a weight record after a unit round trip", async () => {
    await withService((tx) =>
      tx.insert(profiles).values({
        age: 30,
        gender: "male",
        height: "70",
        measurementSystem: "us",
        userId: owner,
        weight: "180",
      })
    );
    await seedSession({ exercises: { [SQUAT]: [[185, 7]] } });
    await asUser(owner, (tx) =>
      updateProfile(tx, owner, { measurement_system: "metric" })
    );
    await asUser(owner, (tx) =>
      updateProfile(tx, owner, { measurement_system: "us" })
    );

    expect(
      (await finishWith({ exercises: { [SQUAT]: [[185, 5]] } })).records
    ).toEqual([]);
    // The converted baseline's higher rep count still applies even once an
    // unconverted tie at 185 lb is in History.
    expect(
      (await finishWith({ exercises: { [SQUAT]: [[185, 6]] } })).records
    ).toEqual([]);
    expect(
      (await finishWith({ exercises: { [SQUAT]: [[185, 8]] } })).records
    ).toEqual([{ exercise_slug: SQUAT, kind: "reps", reps: 8, weight: 185 }]);
  });
});
