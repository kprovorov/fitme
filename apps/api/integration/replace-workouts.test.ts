import { randomBytes } from "node:crypto";
import { asUser } from "@fitme/db";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import { createFakeLibrary, type FakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan, deletePlan, getPlan } from "@fitme/services/plans";
import {
  finishWorkoutSession,
  logSet,
  startWorkoutSession,
} from "@fitme/services/workout-sessions";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import {
  clerk,
  libraryCover,
  libraryExercise,
  signedInAs,
} from "../src/test/harness.js";

/** A Cover for leg days and one for hinge days, so each Workout's pick is certain. */
const LEGS_COVER = "5b1e7c2a-8d4f-4a6b-9c3e-1f2a3b4c5d6e";
const HINGE_COVER = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";

/**
 * PUT /v1/plans/{id}/workouts with the real services facade, through
 * `asUser` on the local stack's pooler, and the fake Library.
 */
const library: FakeLibrary = createFakeLibrary(
  [
    libraryExercise("barbell-back-squat", ["quadriceps"]),
    libraryExercise("barbell-deadlift", ["hamstrings"]),
  ],
  {
    covers: [
      libraryCover(LEGS_COVER, ["quadriceps"]),
      libraryCover(HINGE_COVER, ["hamstrings"]),
    ],
  }
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

const owner = testUserId("replacer");
const intruder = testUserId("intruder");
const users = [owner, intruder];

const set = (weight: number) => ({
  reps_recommended: 8,
  rest_recommended: 120,
  weight_recommended: weight,
});

/** A Plan with two Workouts, as the services create it. */
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
      description: "Squats",
      exercises: [{ exercise_slug: "barbell-back-squat", sets: [set(80)] }],
      name: "Day A",
    },
    {
      description: "Deadlifts",
      exercises: [{ exercise_slug: "barbell-deadlift", sets: [set(120)] }],
      name: "Day B",
    },
  ],
});

/** The Workouts a replacement sends. */
const replacement = () => [
  {
    description: "Deadlifts then squats",
    exercises: [
      { exercise_slug: "barbell-deadlift", sets: [set(100), set(110.5)] },
      { exercise_slug: "barbell-back-squat", sets: [set(0)] },
    ],
    name: "Day C",
  },
];

const put = async (userId: string, planId: string, workouts: unknown) => {
  const response = await app.request(`/v1/plans/${planId}/workouts`, {
    body: JSON.stringify({ workouts }),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method: "PUT",
  });
  return { body: await response.json(), status: response.status };
};

const get = async (path: string, userId: string) => {
  const response = await app.request(path, { headers: signedInAs(userId) });
  return { body: await response.json(), status: response.status };
};

/** A Plan of `userId` read straight through the services, deleted or not. */
const planOf = (userId: string, planId: string) =>
  asUser(userId, (tx) => getPlan(tx, userId, planId));

beforeEach(() => {
  library.failWith(null);
  reported.length = 0;
});

afterAll(async () => {
  await deleteTestUsers(users);
});

describe("PUT /v1/plans/{id}/workouts against the local stack", () => {
  it("replaces the Workouts with new ids and fresh Covers, keeps the metadata and active state, and reads back the same", async () => {
    const plan = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan("Replaced"), { activate: false })
    );
    const oldWorkoutIds = plan.workouts.map((workout) => workout.id);

    const { body, status } = await put(owner, plan.id, replacement());

    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      description: plan.description,
      experience_level: plan.experience_level,
      frequency: plan.frequency,
      goal: plan.goal,
      id: plan.id,
      is_active: false,
      name: "Replaced",
      note: plan.note,
      place: plan.place,
      weight_unit: "kg",
      workout_duration: plan.workout_duration,
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
            exercise.sets.map((s) => [s.order, s.weight_recommended]),
          ]),
        ]
      )
    ).toEqual([
      [
        1,
        "Day C",
        [
          [
            1,
            "barbell-deadlift",
            [
              [1, 100],
              [2, 110.5],
            ],
          ],
          [2, "barbell-back-squat", [[1, 0]]],
        ],
      ],
    ]);
    expect(oldWorkoutIds).not.toContain(body.data.workouts[0].id);
    // Day C ties hamstrings and quadriceps, so its first-met group wins.
    expect(body.data.workouts[0].cover).toBe(HINGE_COVER);
    expect(await get(`/v1/plans/${plan.id}`, owner)).toEqual({
      body,
      status: 200,
    });
    expect(reported).toEqual([]);
  });

  it("keeps the active Plan active", async () => {
    const plan = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan("Active"))
    );

    const { body, status } = await put(owner, plan.id, replacement());

    expect(status).toBe(200);
    expect(body.data.is_active).toBe(true);
    expect((await get("/v1/plans/active", owner)).body.data.id).toBe(plan.id);
  });

  it("keeps past Workout Sessions of the replaced Workouts readable, with their logged sets", async () => {
    const plan = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan("With history"), { activate: false })
    );
    const sessionId = await asUser(owner, async (tx) => {
      const started = await startWorkoutSession(tx, plan.workouts[0].id);
      if (started.status !== "started") {
        throw new Error("The Workout Session didn't start");
      }
      const [exercise] = started.session.exercises;
      await logSet(tx, {
        repsCompleted: 7,
        setId: exercise.sets[0].id,
        weightCompleted: 82.5,
      });
      await finishWorkoutSession(tx, started.session.id);
      return started.session.id;
    });

    expect((await put(owner, plan.id, replacement())).status).toBe(200);

    const { body, status } = await get(
      `/v1/workout-sessions/${sessionId}`,
      owner
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      id: sessionId,
      plan: { id: plan.id, name: "With history" },
      status: "finished",
      workout: null,
    });
    expect(
      body.data.exercises.map(
        (exercise: {
          exercise_slug: string;
          sets: { reps_completed: number; weight_completed: number }[];
        }) => [
          exercise.exercise_slug,
          exercise.sets.map((s) => [s.reps_completed, s.weight_completed]),
        ]
      )
    ).toEqual([["barbell-back-squat", [[7, 82.5]]]]);
  });

  it("refuses unknown slugs with 400 unknown_exercises and keeps the old Workouts, unreported", async () => {
    const plan = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan("Unknown"), { activate: false })
    );
    const workouts = replacement();
    workouts[0].exercises[1].exercise_slug = "made-up-press";

    const { body, status } = await put(owner, plan.id, workouts);

    expect(status).toBe(400);
    expect(body.error).toEqual({
      code: "unknown_exercises",
      message: "Unknown exercise_slug(s): made-up-press",
    });
    expect(await planOf(owner, plan.id)).toEqual(plan);
    expect(reported).toEqual([]);
  });

  it("answers a reported 503 library_unavailable during an outage and keeps the old Workouts", async () => {
    const plan = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan("Outage"), { activate: false })
    );
    const outage = new LibraryUnavailableError();
    library.failWith(outage);

    const { body, status } = await put(owner, plan.id, replacement());

    expect(status).toBe(503);
    expect(body.error.code).toBe("library_unavailable");
    expect(await planOf(owner, plan.id)).toEqual(plan);
    expect(reported).toEqual([outage]);
  });

  it("answers 404 not_found for another User's Plan and changes nothing of theirs", async () => {
    const plan = await asUser(owner, (tx) =>
      createPlan(tx, owner, newPlan("Not yours"), { activate: false })
    );

    const { body, status } = await put(intruder, plan.id, replacement());

    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
    expect(await planOf(owner, plan.id)).toEqual(plan);
    expect(reported).toEqual([]);
  });

  it("answers 404 not_found for a deleted Plan and for one that never existed", async () => {
    const plan = await asUser(owner, async (tx) => {
      const created = await createPlan(tx, owner, newPlan("Deleted"), {
        activate: false,
      });
      await deletePlan(tx, owner, created.id);
      return created;
    });

    const deleted = await put(owner, plan.id, replacement());
    const missing = await put(
      owner,
      "00000000-0000-4000-8000-000000000000",
      replacement()
    );

    expect([deleted.status, missing.status]).toEqual([404, 404]);
    expect(deleted.body.error.code).toBe("not_found");
    expect(missing.body.error.code).toBe("not_found");
    expect(reported).toEqual([]);
  });
});
