import { randomBytes } from "node:crypto";

import {
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
import type { Transaction } from "@fitme/db";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * Each Workout Session Exercise's Previous sets (`GLOSSARY.md`, ADR 0025) on
 * the Workout Session read, start and finish, with the real services facade
 * through `asUser` on the local stack's pooler.
 */
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  identifyUser: () => {},
  reportError: Promise.reject.bind(Promise),
});

const runId = randomBytes(8).toString("hex");
const owner = `user_apiPrevOwner${runId}`;
const intruder = `user_apiPrevIntruder${runId}`;
const starter = `user_apiPrevStarter${runId}`;

const slug = (name: string) => `test-api-prev-${name}-${runId}`;
const bench = slug("bench");
const squat = slug("squat");
const row = slug("row");
const curl = slug("curl");
const dip = slug("dip");

/** A set of a seeded Workout Session: reps logged (or not) and the weight. */
interface SeedSet {
  reps: number | null;
  weight: string | null;
}

interface SeedExercise {
  exerciseSlug: string;
  sets: SeedSet[];
}

/** One of `userId`'s Workout Sessions, its Exercises in the order given. */
const seedSession = async (
  tx: Transaction,
  {
    exercises,
    finished = true,
    planId,
    startedAt,
    userId,
    workoutId,
  }: {
    exercises: SeedExercise[];
    finished?: boolean;
    planId?: string;
    startedAt: string;
    userId: string;
    workoutId?: string;
  }
) => {
  const [session] = await tx
    .insert(workoutSessions)
    .values({
      finishedAt: finished ? startedAt : null,
      planId,
      startedAt,
      userId,
      workoutId,
    })
    .returning({ id: workoutSessions.id });

  // One statement each: RETURNING keeps the VALUES order.
  const sessionExercises = await tx
    .insert(workoutSessionExercises)
    .values(
      exercises.map(({ exerciseSlug }, index) => ({
        exerciseSlug,
        order: index + 1,
        workoutSessionId: session.id,
      }))
    )
    .returning({ id: workoutSessionExercises.id });

  await tx.insert(workoutSessionExerciseSets).values(
    exercises.flatMap(({ sets }, index) =>
      sets.map(({ reps, weight }, setIndex) => ({
        loggedAt: reps === null ? null : startedAt,
        order: setIndex + 1,
        repsCompleted: reps,
        repsRecommended: 8,
        weightCompleted: weight,
        weightRecommended: weight,
        workoutSessionExerciseId: sessionExercises[index].id,
      }))
    )
  );

  return session.id;
};

/** A Plan with one Workout of `exerciseSlugs`, each with one set. */
const seedPlan = async (
  tx: Transaction,
  userId: string,
  name: string,
  exerciseSlugs: string[]
) => {
  const [plan] = await tx
    .insert(plans)
    .values({ frequency: 3, name, userId })
    .returning({ id: plans.id });

  const [workout] = await tx
    .insert(workouts)
    .values({ description: "", name: `${name} day`, order: 1, planId: plan.id })
    .returning({ id: workouts.id });

  const workoutExerciseRows = await tx
    .insert(workoutExercises)
    .values(
      exerciseSlugs.map((exerciseSlug, index) => ({
        exerciseSlug,
        order: index + 1,
        workoutId: workout.id,
      }))
    )
    .returning({ id: workoutExercises.id });

  await tx.insert(workoutExerciseSets).values(
    workoutExerciseRows.map(({ id }) => ({
      order: 1,
      repsRecommended: 8,
      restRecommended: 90,
      weightRecommended: "40",
      workoutExerciseId: id,
    }))
  );

  return { planId: plan.id, workoutId: workout.id };
};

interface Seeded {
  /** The first session with bench, in the first Plan. */
  firstId: string;
  /** The open session read as "today". */
  todayId: string;
  /** The finished session between them, in another Plan. */
  secondId: string;
  starterWorkoutId: string;
}

let seeded: Seeded;

const seed = (): Promise<Seeded> =>
  withService(async (tx) => {
    // us: the owner's weights are in lbs until the conversion test.
    await tx.insert(profiles).values({
      age: 35,
      gender: "female",
      height: "66",
      measurementSystem: "us",
      userId: owner,
      weight: "150",
    });

    const first = await seedPlan(tx, owner, "First plan", [bench]);
    const second = await seedPlan(tx, owner, "Second plan", [bench]);

    const firstId = await seedSession(tx, {
      exercises: [
        {
          exerciseSlug: bench,
          sets: [
            { reps: 8, weight: "100" },
            { reps: 6, weight: "100" },
          ],
        },
        // bodyweight: no weight logged
        { exerciseSlug: squat, sets: [{ reps: 5, weight: null }] },
        { exerciseSlug: row, sets: [{ reps: 12, weight: "60" }] },
      ],
      planId: first.planId,
      startedAt: "2026-09-01T10:00:00Z",
      userId: owner,
      workoutId: first.workoutId,
    });

    const secondId = await seedSession(tx, {
      exercises: [
        {
          exerciseSlug: bench,
          sets: [
            { reps: 10, weight: "220.46" },
            { reps: 0, weight: "220.46" },
            { reps: 7, weight: "220.46" },
            { reps: null, weight: null },
          ],
        },
        // only 0 reps: skipped for the first session's row
        { exerciseSlug: row, sets: [{ reps: 0, weight: "60" }] },
        // twice: the first appearance counts
        { exerciseSlug: curl, sets: [{ reps: 10, weight: "30" }] },
        { exerciseSlug: curl, sets: [{ reps: 15, weight: "20" }] },
      ],
      planId: second.planId,
      startedAt: "2026-09-05T10:00:00Z",
      userId: owner,
      workoutId: second.workoutId,
    });

    // Another User's, between them: never counted.
    await seedSession(tx, {
      exercises: [{ exerciseSlug: bench, sets: [{ reps: 99, weight: "999" }] }],
      startedAt: "2026-09-08T10:00:00Z",
      userId: intruder,
    });

    // Today, open, with bench twice and logged sets of its own: neither
    // appearance takes the other as "last time".
    const todayId = await seedSession(tx, {
      exercises: [
        { exerciseSlug: bench, sets: [{ reps: 12, weight: "250" }] },
        { exerciseSlug: squat, sets: [{ reps: null, weight: null }] },
        { exerciseSlug: row, sets: [{ reps: null, weight: null }] },
        { exerciseSlug: curl, sets: [{ reps: null, weight: null }] },
        { exerciseSlug: dip, sets: [{ reps: null, weight: null }] },
        { exerciseSlug: bench, sets: [{ reps: null, weight: null }] },
      ],
      finished: false,
      startedAt: "2026-09-10T10:00:00Z",
      userId: owner,
    });

    // Started after today: never "last time" for an earlier session.
    await seedSession(tx, {
      exercises: [{ exerciseSlug: bench, sets: [{ reps: 20, weight: "150" }] }],
      startedAt: "2026-09-20T10:00:00Z",
      userId: owner,
    });

    // The starter: one earlier session, and a Plan to start.
    const starterPlan = await seedPlan(tx, starter, "Starter plan", [
      bench,
      dip,
    ]);

    await seedSession(tx, {
      exercises: [{ exerciseSlug: bench, sets: [{ reps: 9, weight: "50" }] }],
      startedAt: "2026-09-01T10:00:00Z",
      userId: starter,
    });

    return {
      firstId,
      secondId,
      starterWorkoutId: starterPlan.workoutId,
      todayId,
    };
  });

/** The status and body of a request as `userId`. */
const requestAs = async (
  userId: string,
  path: string,
  init: RequestInit = {}
) => {
  const response = await app.request(path, {
    ...init,
    headers: {
      ...signedInAs(userId),
      "content-type": "application/json",
    },
  });

  return { body: await response.json(), status: response.status };
};

interface ShownExercise {
  exercise_slug: string;
  previous_sets: unknown[];
}

/** Each Exercise of a read's answer as its slug and Previous sets. */
const previousSetsIn = (body: { data: { exercises: ShownExercise[] } }) =>
  body.data.exercises.map(({ exercise_slug, previous_sets }) => [
    exercise_slug,
    previous_sets,
  ]);

const readToday = async () => {
  const { body, status } = await requestAs(
    owner,
    `/v1/workout-sessions/${seeded.todayId}`
  );

  expect(status).toBe(200);

  return body;
};

describe("previous sets against the local stack", () => {
  beforeAll(async () => {
    seeded = await seed();
  });

  afterAll(async () => {
    await deleteTestUsers([owner, intruder, starter]);
  });

  it("takes the newest earlier session in any Plan, matched by number, without 0-rep sets", async () => {
    const [benchToday] = previousSetsIn(await readToday());

    expect(benchToday).toStrictEqual([
      bench,
      [
        { number: 1, reps_completed: 10, weight_completed: 220.46 },
        { number: 3, reps_completed: 7, weight_completed: 220.46 },
      ],
    ]);
  });

  it("answers bodyweight as null, skips a session with only 0-rep sets, and takes the first appearance", async () => {
    const [, squatToday, rowToday, curlToday] = previousSetsIn(
      await readToday()
    );

    expect([squatToday, rowToday, curlToday]).toStrictEqual([
      [squat, [{ number: 1, reps_completed: 5, weight_completed: null }]],
      [row, [{ number: 1, reps_completed: 12, weight_completed: 60 }]],
      [curl, [{ number: 1, reps_completed: 10, weight_completed: 30 }]],
    ]);
  });

  it("never counts the session itself, nor another User's, and is empty the first time", async () => {
    const shown = previousSetsIn(await readToday());

    const fromSecond = [
      { number: 1, reps_completed: 10, weight_completed: 220.46 },
      { number: 3, reps_completed: 7, weight_completed: 220.46 },
    ];

    expect(shown[4]).toStrictEqual([dip, []]);
    // bench's second appearance today still takes the second session's
    expect(shown[5]).toStrictEqual([bench, fromSecond]);
  });

  it("counts only sessions that started before a finished one", async () => {
    const second = await requestAs(
      owner,
      `/v1/workout-sessions/${seeded.secondId}`
    );

    const first = await requestAs(
      owner,
      `/v1/workout-sessions/${seeded.firstId}`
    );

    expect(previousSetsIn(second.body)[0]).toStrictEqual([
      bench,
      [
        { number: 1, reps_completed: 8, weight_completed: 100 },
        { number: 2, reps_completed: 6, weight_completed: 100 },
      ],
    ]);
    expect(previousSetsIn(first.body)).toStrictEqual([
      [bench, []],
      [squat, []],
      [row, []],
    ]);
  });

  describe("start and finish", () => {
    const expected = () => [
      [bench, [{ number: 1, reps_completed: 9, weight_completed: 50 }]],
      [dip, []],
    ];

    const start = () =>
      requestAs(starter, "/v1/workout-sessions", {
        body: JSON.stringify({ workout_id: seeded.starterWorkoutId }),
        method: "POST",
      });

    it("answers starting (201) and resuming (200) with the field", async () => {
      const started = await start();
      const resumed = await start();

      expect([started.status, resumed.status]).toStrictEqual([201, 200]);
      expect(previousSetsIn(started.body)).toStrictEqual(expected());
      expect(previousSetsIn(resumed.body)).toStrictEqual(expected());
    });

    it("answers finishing with the field", async () => {
      const { body } = await start();

      const finished = await requestAs(
        starter,
        `/v1/workout-sessions/${body.data.id}/finish`,
        { method: "POST" }
      );

      expect(finished.status).toBe(200);
      expect(previousSetsIn(finished.body)).toStrictEqual(expected());
    });
  });

  // Last: it converts every stored weight of the owner.
  it("answers the weight in the read's unit after a measurement system change", async () => {
    const changed = await requestAs(owner, "/v1/profile", {
      body: JSON.stringify({ measurement_system: "metric" }),
      method: "PATCH",
    });

    expect(changed.status).toBe(200);

    const body = await readToday();

    expect(body.data.weight_unit).toBe("kg");
    expect(previousSetsIn(body)[0]).toStrictEqual([
      bench,
      [
        { number: 1, reps_completed: 10, weight_completed: 100 },
        { number: 3, reps_completed: 7, weight_completed: 100 },
      ],
    ]);
  });
});
