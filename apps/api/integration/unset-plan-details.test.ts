import { randomBytes } from "node:crypto";

import { createFakeLibrary } from "@fitme/library-sdk/fake";
import type { FakeLibrary } from "@fitme/library-sdk/fake";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, libraryExercise, signedInAs } from "../src/test/harness.js";

/**
 * A Plan's goal, place, experience level and workout duration are optional
 * (ADR 0017). Against the local stack, through the real services facade: a
 * create that leaves them out stores them unset, a `PATCH` with `null` clears
 * one, a whole-Plan save that leaves them out clears them, and every read
 * answers them as `null`.
 */

const library: FakeLibrary = createFakeLibrary([
  libraryExercise("barbell-back-squat", ["quadriceps"]),
]);

const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createLibrary: () => library,
  createServices: createServicesFromEnv,
  identifyUser: () => {},
  reportError: () => Promise.resolve(),
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const builder = testUserId("builder");
const editor = testUserId("editor");
const users = [builder, editor];

/** The four details, as a read answers them when the Plan has none. */
const UNSET_DETAILS = {
  experience_level: null,
  goal: null,
  place: null,
  workout_duration: null,
};

const workout = (name: string) => ({
  exercises: [
    {
      exercise_slug: "barbell-back-squat",
      sets: [
        { reps_recommended: 10, rest_recommended: 90, weight_recommended: 0 },
      ],
    },
  ],
  name,
});

const send = async (
  method: string,
  path: string,
  userId: string,
  body: unknown
) => {
  const response = await app.request(path, {
    body: JSON.stringify(body),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method,
  });

  return { body: await response.json(), status: response.status };
};

const get = async (path: string, userId: string) => {
  const response = await app.request(path, { headers: signedInAs(userId) });

  return { body: await response.json(), status: response.status };
};

describe("a Plan with unset details against the local stack", () => {
  afterAll(async () => {
    await deleteTestUsers(users);
  });

  it("creates a Plan from a name and a frequency alone, and reads the four back as null", async () => {
    const created = await send("POST", "/v1/plans", builder, {
      description: "",
      frequency: 2,
      name: "Built by hand",
      workouts: [
        { ...workout("Workout A"), description: "" },
        { ...workout("Workout B"), description: "" },
      ],
    });

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      ...UNSET_DETAILS,
      frequency: 2,
      is_active: true,
      name: "Built by hand",
    });

    // The columns really hold NULL: every read answers the same.
    const planId = created.body.data.id;

    const [byId, active, listed] = await Promise.all([
      get(`/v1/plans/${planId}`, builder),
      get("/v1/plans/active", builder),
      get("/v1/plans", builder),
    ]);

    expect(byId.body.data).toMatchObject(UNSET_DETAILS);
    expect(active.body.data).toMatchObject(UNSET_DETAILS);
    expect(listed.body.data).toMatchObject([UNSET_DETAILS]);
  });

  it("clears a detail a PATCH sends as null, and leaves the others alone", async () => {
    const created = await send("POST", "/v1/plans", editor, {
      description: "",
      experience_level: "advanced",
      frequency: 3,
      goal: "muscle-gain",
      name: "Every detail",
      place: "gym",
      workout_duration: 45,
      workouts: [{ ...workout("Workout A"), description: "" }],
    });

    expect(created.status).toBe(201);
    const planId = created.body.data.id;
    expect(created.body.data).toMatchObject({
      experience_level: "advanced",
      goal: "muscle-gain",
      place: "gym",
      workout_duration: 45,
    });

    const cleared = await send("PATCH", `/v1/plans/${planId}`, editor, {
      goal: null,
    });

    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({
      experience_level: "advanced",
      goal: null,
      place: "gym",
      workout_duration: 45,
    });

    // Read back in its own transaction: the column holds NULL.
    const read = await get(`/v1/plans/${planId}`, editor);

    expect(read.body.data).toMatchObject({
      experience_level: "advanced",
      goal: null,
      place: "gym",
    });
  });

  it("clears every detail a whole-Plan save leaves out, keeping the rows it keeps", async () => {
    const created = await send("POST", "/v1/plans", editor, {
      description: "",
      experience_level: "beginner",
      frequency: 1,
      goal: "fat-loss",
      name: "Saved over",
      place: "home",
      workout_duration: 30,
      workouts: [{ ...workout("Workout A"), description: "" }],
    });

    expect(created.status).toBe(201);
    const plan = created.body.data;
    const [keptWorkout] = plan.workouts;

    const saved = await send("PUT", `/v1/plans/${plan.id}`, editor, {
      frequency: 1,
      name: "Saved over",
      workouts: [
        {
          exercises: [
            {
              exercise_slug: "barbell-back-squat",
              id: keptWorkout.exercises[0].id,
              sets: [
                {
                  id: keptWorkout.exercises[0].sets[0].id,
                  reps_recommended: 12,
                  rest_recommended: 60,
                  weight_recommended: 0,
                },
              ],
            },
          ],
          id: keptWorkout.id,
          name: "Workout A",
        },
      ],
    });

    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject(UNSET_DETAILS);
    // The kept Workout keeps its id, so its history stays linked.
    expect(saved.body.data.workouts[0].id).toBe(keptWorkout.id);

    const read = await get(`/v1/plans/${plan.id}`, editor);

    expect(read.body.data).toMatchObject(UNSET_DETAILS);
  });
});
