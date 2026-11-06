import { randomBytes } from "node:crypto";

import { asUser } from "@fitme/db";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import { createFakeLibrary } from "@fitme/library-sdk/fake";
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan, getPlan } from "@fitme/services/plans";
import type { PlanDetail, SavedPlan } from "@fitme/services/plans";
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

const LEGS_COVER = "5b1e7c2a-8d4f-4a6b-9c3e-1f2a3b4c5d6e";
const HINGE_COVER = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
const CHEST_COVER = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";

/**
 * PUT /v1/plans/{id} with the real services facade, through `asUser` on the
 * local stack's pooler, and the fake Library.
 */
const library: FakeLibrary = createFakeLibrary(
  [
    libraryExercise("barbell-back-squat", ["quadriceps"]),
    libraryExercise("barbell-deadlift", ["hamstrings"]),
    libraryExercise("barbell-bench-press", ["chest"]),
  ],
  {
    covers: [
      libraryCover(LEGS_COVER, ["quadriceps"]),
      libraryCover(HINGE_COVER, ["hamstrings"]),
      libraryCover(CHEST_COVER, ["chest"]),
    ],
  }
);

const reported: unknown[] = [];

const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createLibrary: () => library,
  createServices: createServicesFromEnv,
  identifyUser: () => {},
  reportError: (error) => {
    reported.push(error);

    return Promise.resolve();
  },
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("saver");
const intruder = testUserId("intruder");
const users = [owner, intruder];

const set = (weight: number, reps = 8) => ({
  reps_recommended: reps,
  rest_recommended: 120,
  weight_recommended: weight,
});

/** A Plan with two Workouts, the first with two Exercises, as the services create it. */
const newPlan = (name: string, covers: (string | null)[] = [null, null]) => ({
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
      cover: covers[0],
      description: "Squats and presses",
      exercises: [
        { exercise_slug: "barbell-back-squat", sets: [set(80), set(85)] },
        { exercise_slug: "barbell-bench-press", sets: [set(60)] },
      ],
      name: "Day A",
    },
    {
      cover: covers[1],
      description: "Deadlifts",
      exercises: [{ exercise_slug: "barbell-deadlift", sets: [set(120)] }],
      name: "Day B",
    },
  ],
});

/** The Plan's details as a save sends them back unchanged. */
const detailsOf = (plan: PlanDetail) => ({
  description: plan.description ?? undefined,
  experience_level: plan.experience_level,
  frequency: plan.frequency,
  goal: plan.goal,
  name: plan.name ?? "",
  note: plan.note,
  place: plan.place,
  workout_duration: plan.workout_duration,
});

/** The Plan as a save sends it back unchanged: every row with its id. */
const unchanged = (plan: PlanDetail) => ({
  ...detailsOf(plan),
  workouts: plan.workouts.map((workout) => ({
    description: workout.description,
    exercises: workout.exercises.map((exercise) => ({
      exercise_slug: exercise.exercise_slug,
      id: exercise.id,
      sets: exercise.sets.map((s) => ({
        id: s.id,
        reps_recommended: s.reps_recommended,
        rest_recommended: s.rest_recommended,
        weight_recommended: s.weight_recommended,
      })),
    })),
    id: workout.id,
    name: workout.name,
  })),
});

const put = async (userId: string, planId: string, payload: SavedPlan) => {
  const response = await app.request(`/v1/plans/${planId}`, {
    body: JSON.stringify(payload),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method: "PUT",
  });

  return { body: await response.json(), status: response.status };
};

const request = async (
  path: string,
  userId: string,
  init: { body?: unknown; method?: string } = {}
) => {
  const response = await app.request(path, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method: init.method ?? "GET",
  });

  return {
    body: response.status === 204 ? null : await response.json(),
    status: response.status,
  };
};

/** A Plan of `userId` read straight through the services. */
const planOf = (userId: string, planId: string) =>
  asUser(userId, (tx) => getPlan(tx, userId, planId));

const created = (
  userId: string,
  name: string,
  {
    activate = false,
    covers,
  }: { activate?: boolean; covers?: (string | null)[] } = {}
) =>
  asUser(userId, (tx) =>
    createPlan(tx, userId, newPlan(name, covers), { activate })
  );

/** Starts a Workout Session of `workoutId` and logs its first set, finishing it unless `open`. */
const sessionOf = (workoutId: string, { open = false } = {}) =>
  asUser(owner, async (tx) => {
    const started = await startWorkoutSession(tx, workoutId);

    if (started.status !== "started") {
      throw new Error("The Workout Session didn't start");
    }

    await logSet(tx, {
      repsCompleted: 7,
      setId: started.session.exercises[0].sets[0].id,
      weightCompleted: 82.5,
    });

    if (!open) {
      await finishWorkoutSession(tx, started.session.id);
    }

    return started.session.id;
  });

describe("pUT /v1/plans/{id} against the local stack", () => {
  beforeEach(() => {
    library.failWith(null);
    reported.length = 0;
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("keeps the rows sent with their ids, creates the ones sent without, deletes the ones left out and orders them as sent", async () => {
    const plan = await created(owner, "Edited");
    const [dayA, dayB] = plan.workouts;
    const [squat, bench] = dayA.exercises;

    const { body, status } = await put(owner, plan.id, {
      experience_level: "advanced",
      frequency: 2,
      goal: "muscle-gain",
      name: "Edited again",
      place: "home",
      workout_duration: 45,
      // Day B first, Day A's bench press gone and its squat reordered, a new
      // Workout last; no description or note, which clears them
      workouts: [
        {
          exercises: [
            {
              exercise_slug: "barbell-deadlift",
              id: dayB.exercises[0].id,
              sets: [
                { ...set(125, 5), id: dayB.exercises[0].sets[0].id },
                set(130, 3),
              ],
            },
          ],
          id: dayB.id,
          name: "Pull day",
        },
        {
          description: "Squats only",
          exercises: [
            { exercise_slug: "barbell-deadlift", sets: [set(100)] },
            {
              exercise_slug: "barbell-back-squat",
              id: squat.id,
              sets: [{ ...set(85), id: squat.sets[1].id }],
            },
          ],
          id: dayA.id,
          name: "Day A",
        },
        {
          exercises: [
            { exercise_slug: "barbell-bench-press", sets: [set(62.5)] },
          ],
          name: "Day C",
        },
      ],
    });

    expect({ data: body.data, status }).toMatchObject({
      data: {
        description: null,
        experience_level: "advanced",
        frequency: 2,
        id: plan.id,
        is_active: false,
        name: "Edited again",
        note: null,
        place: "home",
        weight_unit: "kg",
        workout_duration: 45,
      },
      status: 200,
    });
    const [pull, legs, dayC] = body.data.workouts;
    expect({
      dayC: [dayC.order, dayC.name],
      legs: [legs.id, legs.order, legs.description],
      legsExercises: legs.exercises.map(
        (exercise: {
          exercise_slug: string;
          id: string;
          order: number;
          sets: { id: string; order: number }[];
        }) => [
          exercise.order,
          exercise.exercise_slug,
          exercise.id === squat.id,
          exercise.sets.map((s) => [s.order, s.id === squat.sets[1].id]),
        ]
      ),
      pull: [pull.id, pull.order, pull.name, pull.description],
      pullExercises: pull.exercises,
    }).toStrictEqual({
      dayC: [3, "Day C"],
      legs: [dayA.id, 2, "Squats only"],
      legsExercises: [
        [1, "barbell-deadlift", false, [[1, false]]],
        [2, "barbell-back-squat", true, [[1, true]]],
      ],
      pull: [dayB.id, 1, "Pull day", ""],
      pullExercises: [
        {
          exercise_slug: "barbell-deadlift",
          id: dayB.exercises[0].id,
          order: 1,
          sets: [
            {
              id: dayB.exercises[0].sets[0].id,
              order: 1,
              reps_recommended: 5,
              rest_recommended: 120,
              weight_recommended: 125,
            },
            {
              id: expect.any(String),
              order: 2,
              reps_recommended: 3,
              rest_recommended: 120,
              weight_recommended: 130,
            },
          ],
        },
      ],
    });
    const keptIds = [dayA.id, dayB.id, squat.id, bench.id];
    const savedJson = JSON.stringify(body.data);
    expect({
      deletedExerciseIsPresent: savedJson.includes(bench.id),
      deletedSetIsPresent: savedJson.includes(squat.sets[0].id),
      newWorkoutIsKept: keptIds.includes(dayC.id),
    }).toStrictEqual({
      deletedExerciseIsPresent: false,
      deletedSetIsPresent: false,
      newWorkoutIsKept: false,
    });
    await expect(request(`/v1/plans/${plan.id}`, owner)).resolves.toStrictEqual(
      {
        body,
        status: 200,
      }
    );
    expect(reported).toStrictEqual([]);
  });

  it("saving the Plan unchanged changes nothing but updated_at", async () => {
    const plan = await created(owner, "Unchanged", { activate: true });

    const { body, status } = await put(owner, plan.id, unchanged(plan));

    expect(status).toBe(200);
    expect({ ...body.data, updated_at: plan.updated_at }).toStrictEqual({
      ...plan,
      weight_unit: "kg",
    });
  });

  it("keeps Workout Sessions of the kept Workouts linked, and those of a deleted one readable with no Workout", async () => {
    const plan = await created(owner, "With history");
    const [dayA, dayB] = plan.workouts;
    const sessionA = await sessionOf(dayA.id);
    const sessionB = await sessionOf(dayB.id);
    const saved = unchanged(plan);

    const { status } = await put(owner, plan.id, {
      ...saved,
      workouts: [saved.workouts[1]],
    });

    expect(status).toBe(200);

    const [readA, readB] = await Promise.all([
      request(`/v1/workout-sessions/${sessionA}`, owner),
      request(`/v1/workout-sessions/${sessionB}`, owner),
    ]);

    expect(readA.body.data).toMatchObject({
      id: sessionA,
      plan: { id: plan.id },
      status: "finished",
      workout: null,
    });
    expect(readA.body.data.exercises[0].sets[0]).toMatchObject({
      reps_completed: 7,
      weight_completed: 82.5,
    });
    expect(readB.body.data).toMatchObject({
      id: sessionB,
      workout: { id: dayB.id, name: "Day B" },
    });
  });

  it("keeps an open Workout Session running when its Workout is deleted", async () => {
    const plan = await created(owner, "Mid-workout");
    const [dayA] = plan.workouts;
    const sessionId = await sessionOf(dayA.id, { open: true });
    const saved = unchanged(plan);

    const { status } = await put(owner, plan.id, {
      ...saved,
      workouts: [saved.workouts[1]],
    });

    expect(status).toBe(200);

    const open = await request(`/v1/workout-sessions/${sessionId}`, owner);
    expect(open.body.data).toMatchObject({
      status: "in_progress",
      workout: null,
    });
    const setId = open.body.data.exercises[0].sets[1].id;

    const logged = await request(`/v1/workout-session-sets/${setId}`, owner, {
      body: { reps_completed: 6, weight_completed: 85 },
      method: "PATCH",
    });

    expect(logged.status).toBe(200);

    const finished = await request(
      `/v1/workout-sessions/${sessionId}/finish`,
      owner,
      { method: "POST" }
    );

    expect(finished.status).toBe(200);
    expect(finished.body.data.status).toBe("finished");
  });

  it("keeps the kept Workouts' Covers and gives a new Workout one the Plan doesn't hold yet", async () => {
    const plan = await created(owner, "Covered", {
      covers: [LEGS_COVER, null],
    });

    const saved = unchanged(plan);

    const { body, status } = await put(owner, plan.id, {
      ...saved,
      workouts: [
        saved.workouts[0],
        {
          // Trains quadriceps, whose Cover Day A already holds
          exercises: [{ exercise_slug: "barbell-back-squat", sets: [set(70)] }],
          name: "Day C",
        },
      ],
    });

    expect(status).toBe(200);
    const [dayA, dayC] = body.data.workouts;
    expect(dayA).toMatchObject({ cover: LEGS_COVER, id: plan.workouts[0].id });
    expect([HINGE_COVER, CHEST_COVER]).toContain(dayC.cover);
  });

  it("records a Weekly goal change when the active Plan's frequency changes", async () => {
    const plan = await created(owner, "Weekly", { activate: true });

    const before = await request("/v1/weekly-goals", owner);
    expect(before.body.data.at(-1).target).toBe(3);

    const { status } = await put(owner, plan.id, {
      ...unchanged(plan),
      frequency: 5,
    });

    const after = await request("/v1/weekly-goals", owner);

    expect(status).toBe(200);
    expect(after.body.data).toHaveLength(before.body.data.length + 1);
    expect(after.body.data.at(-1).target).toBe(5);
  });

  it("refuses with 400 invalid_request, changing nothing, an id of another User's Plan, another Plan's, or one under another parent", async () => {
    const plan = await created(owner, "Guarded");
    const other = await created(owner, "Other");
    const foreign = await created(intruder, "Theirs");
    const saved = unchanged(plan);

    const withWorkoutId = (id: string) => ({
      ...saved,
      workouts: [{ ...saved.workouts[0], id }, saved.workouts[1]],
    });

    // Day A's squat sent under Day B
    const moved = {
      ...saved,
      workouts: [
        { ...saved.workouts[0], exercises: [saved.workouts[0].exercises[1]] },
        {
          ...saved.workouts[1],
          exercises: [
            ...saved.workouts[1].exercises,
            saved.workouts[0].exercises[0],
          ],
        },
      ],
    };

    // A kept set sent under a new Exercise
    const underNew = {
      ...saved,
      workouts: [
        {
          ...saved.workouts[0],
          exercises: [
            {
              ...saved.workouts[0].exercises[0],
              id: undefined,
            },
          ],
        },
        saved.workouts[1],
      ],
    };

    // The same Workout twice
    const repeated = {
      ...saved,
      workouts: [saved.workouts[0], saved.workouts[0]],
    };

    const answers = await Promise.all(
      [
        withWorkoutId(foreign.workouts[0].id),
        withWorkoutId(other.workouts[0].id),
        moved,
        underNew,
        repeated,
      ].map((payload) => put(owner, plan.id, payload))
    );

    for (const answer of answers) {
      expect(answer.status).toBe(400);
      expect(answer.body.error.code).toBe("invalid_request");
    }

    expect(answers[0].body.error.message).toContain(foreign.workouts[0].id);
    await expect(planOf(owner, plan.id)).resolves.toStrictEqual(plan);
    await expect(planOf(intruder, foreign.id)).resolves.toStrictEqual(foreign);
    await expect(planOf(owner, other.id)).resolves.toStrictEqual(other);
    expect(reported).toStrictEqual([]);
  });

  it("answers 404 not_found for another User's Plan and changes nothing of theirs", async () => {
    const plan = await created(owner, "Not yours");

    const { body, status } = await put(intruder, plan.id, unchanged(plan));

    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
    await expect(planOf(owner, plan.id)).resolves.toStrictEqual(plan);
  });

  it("answers 404 not_found for a deleted Plan", async () => {
    const plan = await created(owner, "Deleted");
    await request(`/v1/plans/${plan.id}`, owner, { method: "DELETE" });

    const { body, status } = await put(owner, plan.id, unchanged(plan));

    expect(status).toBe(404);
    expect(body.error.code).toBe("not_found");
  });

  it("refuses unknown slugs with 400 unknown_exercises and changes nothing, unreported", async () => {
    const plan = await created(owner, "Unknown");
    const saved = unchanged(plan);
    saved.workouts[1].exercises[0].exercise_slug = "made-up-press";

    const { body, status } = await put(owner, plan.id, saved);

    expect(status).toBe(400);
    expect(body.error).toStrictEqual({
      code: "unknown_exercises",
      message: "Unknown exercise_slug(s): made-up-press",
    });
    await expect(planOf(owner, plan.id)).resolves.toStrictEqual(plan);
    expect(reported).toStrictEqual([]);
  });

  it("answers a reported 503 library_unavailable during an outage and changes nothing", async () => {
    const plan = await created(owner, "Outage");
    const outage = new LibraryUnavailableError();
    library.failWith(outage);

    const { body, status } = await put(owner, plan.id, unchanged(plan));

    expect(status).toBe(503);
    expect(body.error.code).toBe("library_unavailable");
    await expect(planOf(owner, plan.id)).resolves.toStrictEqual(plan);
    expect(reported).toStrictEqual([outage]);
  });
});
