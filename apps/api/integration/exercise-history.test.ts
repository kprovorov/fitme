import { randomBytes } from "node:crypto";
import {
  plans,
  profiles,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * The Exercise history read with the real services facade, through `asUser` on
 * the local stack's pooler, as made-up Clerk-style User ids with test-signed
 * session tokens.
 */
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  identifyUser: () => undefined,
  reportError: (error) => Promise.reject(error),
});

const runId = randomBytes(8).toString("hex");
const owner = `user_apiExHistOwner${runId}`;
const intruder = `user_apiExHistIntruder${runId}`;
const pullUpSlug = `test-api-hist-pull-up-${runId}`;
const otherSlug = `test-api-hist-other-${runId}`;

/** One set to seed: its logged reps (`null` = never logged) and weight. */
interface SeedSet {
  reps: number | null;
  weight: number | null;
}

interface Seeded {
  /** The Workout Session Exercise ids, oldest Workout Session first. */
  bodyweightExerciseId: string;
  bodyweightSessionId: string;
  intruderExerciseId: string;
  intruderSessionId: string;
  loggedExerciseId: string;
  loggedSessionId: string;
  newestExerciseId: string;
  newestSessionId: string;
  unloggedSessionId: string;
}

/** A Workout Session of `userId` with one entry of `slug` holding `sets`. */
const seedSession = async (
  tx: Parameters<Parameters<typeof withService>[0]>[0],
  {
    planId,
    sets,
    slug,
    startedAt,
    userId,
    workoutId,
  }: {
    planId: string | null;
    sets: SeedSet[];
    slug: string;
    startedAt: string;
    userId: string;
    workoutId: string | null;
  }
) => {
  const [session] = await tx
    .insert(workoutSessions)
    .values({
      finishedAt: startedAt,
      planId,
      startedAt,
      userId,
      workoutId,
    })
    .returning({ id: workoutSessions.id });
  const [exercise] = await tx
    .insert(workoutSessionExercises)
    .values({ exerciseSlug: slug, order: 1, workoutSessionId: session.id })
    .returning({ id: workoutSessionExercises.id });
  if (sets.length > 0) {
    // inserted out of order, so the read must sort by `order`
    await tx.insert(workoutSessionExerciseSets).values(
      sets
        .map(({ reps, weight }, index) => ({
          loggedAt: reps === null ? null : startedAt,
          order: index + 1,
          repsCompleted: reps,
          repsRecommended: 10,
          restRecommended: 90,
          weightCompleted: weight === null ? null : String(weight),
          weightRecommended: "45.00",
          workoutSessionExerciseId: exercise.id,
        }))
        .reverse()
    );
  }
  return { exerciseId: exercise.id, sessionId: session.id };
};

const seed = (): Promise<Seeded> =>
  withService(async (tx) => {
    // us: the owner's weights are in lbs; the intruder has no Profile.
    await tx.insert(profiles).values({
      age: 41,
      gender: "male",
      height: "70",
      measurementSystem: "us",
      userId: owner,
      weight: "180",
    });
    const [plan] = await tx
      .insert(plans)
      .values({
        frequency: 3,
        goal: "general",
        name: "History plan",
        place: "gym",
        userId: owner,
      })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({ description: "A", name: "Day A", order: 1, planId: plan.id })
      .returning({ id: workouts.id });
    const seedOwner = (startedAt: string, sets: SeedSet[], slug = pullUpSlug) =>
      seedSession(tx, {
        planId: plan.id,
        sets,
        slug,
        startedAt,
        userId: owner,
        workoutId: workout.id,
      });

    // one logged set with a weight, one never logged
    const logged = await seedOwner("2026-10-01T10:00:00Z", [
      { reps: 8, weight: 45 },
      { reps: null, weight: null },
    ]);
    // bodyweight: logged reps, no weight
    const bodyweight = await seedOwner("2026-10-02T10:00:00Z", [
      { reps: 12, weight: null },
    ]);
    const newest = await seedOwner("2026-10-03T10:00:00Z", [
      { reps: 6, weight: 50 },
    ]);
    // nothing logged at all: left out of the page and the total
    const unlogged = await seedOwner("2026-10-04T10:00:00Z", [
      { reps: null, weight: null },
    ]);
    // another Exercise of the owner's, never in this history
    await seedOwner(
      "2026-10-05T10:00:00Z",
      [{ reps: 5, weight: 95 }],
      otherSlug
    );
    const theirs = await seedSession(tx, {
      planId: null,
      sets: [{ reps: 20, weight: 200 }],
      slug: pullUpSlug,
      startedAt: "2026-10-06T10:00:00Z",
      userId: intruder,
      workoutId: null,
    });

    return {
      bodyweightExerciseId: bodyweight.exerciseId,
      bodyweightSessionId: bodyweight.sessionId,
      intruderExerciseId: theirs.exerciseId,
      intruderSessionId: theirs.sessionId,
      loggedExerciseId: logged.exerciseId,
      loggedSessionId: logged.sessionId,
      newestExerciseId: newest.exerciseId,
      newestSessionId: newest.sessionId,
      unloggedSessionId: unlogged.sessionId,
    };
  });

let seeded: Seeded;

/** The status and body of the Exercise history as `userId`. */
const historyAs = async (userId: string, query: string) => {
  const response = await app.request(`/v1/workout-session-exercises?${query}`, {
    headers: signedInAs(userId),
  });
  return { body: await response.json(), status: response.status };
};

const ownerHistory = (extra = "") =>
  historyAs(owner, `exercise_slug=${pullUpSlug}${extra}`);

beforeAll(async () => {
  seeded = await seed();
});

afterAll(async () => {
  await deleteTestUsers([owner, intruder]);
});

describe("GET /v1/workout-session-exercises against the local stack", () => {
  it("lists the entries newest first, with the targets and the User's weight unit", async () => {
    expect(await ownerHistory()).toEqual({
      body: {
        data: [
          {
            id: seeded.newestExerciseId,
            session: {
              finished_at: "2026-10-03T10:00:00+00:00",
              id: seeded.newestSessionId,
              started_at: "2026-10-03T10:00:00+00:00",
            },
            sets: [
              {
                id: expect.any(String),
                order: 1,
                reps_completed: 6,
                reps_recommended: 10,
                weight_completed: 50,
                weight_recommended: 45,
              },
            ],
          },
          {
            id: seeded.bodyweightExerciseId,
            session: {
              finished_at: "2026-10-02T10:00:00+00:00",
              id: seeded.bodyweightSessionId,
              started_at: "2026-10-02T10:00:00+00:00",
            },
            // a bodyweight set: logged reps, no weight
            sets: [
              {
                id: expect.any(String),
                order: 1,
                reps_completed: 12,
                reps_recommended: 10,
                weight_completed: null,
                weight_recommended: 45,
              },
            ],
          },
          {
            id: seeded.loggedExerciseId,
            session: {
              finished_at: "2026-10-01T10:00:00+00:00",
              id: seeded.loggedSessionId,
              started_at: "2026-10-01T10:00:00+00:00",
            },
            // the second set was never logged: left out
            sets: [expect.objectContaining({ order: 1, reps_completed: 8 })],
          },
        ],
        hasMore: false,
        total: 3,
        // the owner's Profile is us, so their weights are in lbs
        weight_unit: "lbs",
      },
      status: 200,
    });
  });

  it("leaves out the Workout Session where nothing was logged", async () => {
    const { body } = await ownerHistory();

    expect(
      body.data.map((entry: { session: { id: string } }) => entry.session.id)
    ).not.toContain(seeded.unloggedSessionId);
  });

  it("pages the entries, with the total across every page", async () => {
    const first = await ownerHistory("&limit=2");
    const second = await ownerHistory("&limit=2&offset=2");

    expect(first.body).toMatchObject({ hasMore: true, total: 3 });
    expect(first.body.data.map((entry: { id: string }) => entry.id)).toEqual([
      seeded.newestExerciseId,
      seeded.bodyweightExerciseId,
    ]);
    expect(second.body).toMatchObject({ hasMore: false, total: 3 });
    expect(second.body.data.map((entry: { id: string }) => entry.id)).toEqual([
      seeded.loggedExerciseId,
    ]);
  });

  it("answers an empty page past the end, and for an Exercise the User never did", async () => {
    expect((await ownerHistory("&offset=10")).body).toEqual({
      data: [],
      hasMore: false,
      total: 3,
      weight_unit: "lbs",
    });
    expect(
      (await historyAs(owner, `exercise_slug=never-done-${runId}`)).body
    ).toEqual({ data: [], hasMore: false, total: 0, weight_unit: "lbs" });
  });

  it("never shows another User's rows, each User seeing only their own", async () => {
    expect(await historyAs(intruder, `exercise_slug=${pullUpSlug}`)).toEqual({
      body: {
        data: [
          expect.objectContaining({
            id: seeded.intruderExerciseId,
            session: expect.objectContaining({
              id: seeded.intruderSessionId,
            }),
          }),
        ],
        hasMore: false,
        total: 1,
        // no Profile: metric, so kg
        weight_unit: "kg",
      },
      status: 200,
    });
    const { body } = await ownerHistory();
    expect(
      body.data.map((entry: { session: { id: string } }) => entry.session.id)
    ).not.toContain(seeded.intruderSessionId);
  });
});
