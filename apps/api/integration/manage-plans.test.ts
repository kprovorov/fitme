import { randomBytes, randomUUID } from "node:crypto";

import { asUser } from "@fitme/db";
import { deleteTestUsers } from "@fitme/services/delete-test-users";
import { createPlan } from "@fitme/services/plans";
import type { NewPlan, PlanDetail } from "@fitme/services/plans";
import { startWorkoutSession } from "@fitme/services/workout-sessions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import { clerk, signedInAs } from "../src/test/harness.js";

/**
 * PATCH, activate and DELETE of a Plan with the real services facade, through
 * `asUser` on the local stack's pooler, as made-up Clerk-style User ids.
 * Plans are seeded through the services as each User.
 */
const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  identifyUser: () => {},
  reportError: Promise.reject.bind(Promise),
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("owner");
const intruder = testUserId("intruder");
const users = [owner, intruder];

/** A Plan of two Workouts, by slugs the fake Library knows. */
const newPlan = (name: string): NewPlan => ({
  description: `${name} description`,
  experience_level: "intermediate",
  frequency: 3,
  goal: "muscle-gain",
  name,
  note: "Deload every fourth week",
  place: "gym",
  workout_duration: 60,
  workouts: ["Day A", "Day B"].map((workoutName) => ({
    description: `${workoutName} description`,
    exercises: [
      {
        exercise_slug: "barbell-back-squat",
        sets: [
          {
            reps_recommended: 8,
            rest_recommended: 120,
            weight_recommended: 80,
          },
        ],
      },
    ],
    name: workoutName,
  })),
});

const seedPlan = (userId: string, name: string) =>
  asUser(userId, (tx) => createPlan(tx, userId, newPlan(name)));

/** The status and body of a request as `userId`. */
const send = async (
  userId: string,
  method: string,
  path: string,
  payload?: Partial<NewPlan>
) => {
  const response = await app.request(path, {
    method,
    ...(payload === undefined
      ? { headers: signedInAs(userId) }
      : {
          body: JSON.stringify(payload),
          headers: {
            ...signedInAs(userId),
            "content-type": "application/json",
          },
        }),
  });

  const text = await response.text();

  return { body: text ? JSON.parse(text) : null, status: response.status };
};

/** The User's live Plans as `[id, is_active]`, newest first. */
const activeFlags = async (userId: string) => {
  const { body } = await send(userId, "GET", "/v1/plans");

  return body.data.map((plan: { id: string; is_active: boolean }) => [
    plan.id,
    plan.is_active,
  ]);
};

type Request = readonly [
  method: string,
  path: string,
  payload?: Partial<NewPlan>,
];

/** Sends each request as `userId`, side by side: each one's status and error code. */
const answersOf = async (userId: string, requests: Request[]) => {
  const answers = await Promise.all(
    requests.map(([method, path, payload]) =>
      send(userId, method, path, payload)
    )
  );

  return answers.map(({ body, status }) => [status, body?.error?.code]);
};

/** What `answersOf` gives when every one of `count` requests found nothing. */
const allNotFound = (count: number) =>
  Array.from({ length: count }, () => [404, "not_found"]);

const workoutIds = (plan: { workouts: { id: string }[] }) =>
  plan.workouts.map((workout) => workout.id);

describe("managing Plans against the local stack", () => {
  let first: PlanDetail;
  let second: PlanDetail;
  let theirs: PlanDetail;

  beforeAll(async () => {
    first = await seedPlan(owner, "First");
    // Created last of the owner's, so it's the active one (createPlan activates)
    second = await seedPlan(owner, "Second");
    theirs = await seedPlan(intruder, "Theirs");
  });

  afterAll(async () => {
    await deleteTestUsers(users);
  });

  describe("pATCH /v1/plans/{id} against the local stack", () => {
    it("changes only the given fields and keeps every Workout and its id", async () => {
      const { body, status } = await send(
        owner,
        "PATCH",
        `/v1/plans/${first.id}`,
        {
          frequency: 4,
          name: "First, renamed",
          note: null,
        }
      );

      expect(status).toBe(200);
      expect(body.data).toMatchObject({
        description: "First description",
        frequency: 4,
        goal: "muscle-gain",
        id: first.id,
        name: "First, renamed",
        note: null,
        weight_unit: "kg",
        workout_duration: 60,
      });
      expect(workoutIds(body.data)).toStrictEqual(workoutIds(first));
      const saved = await send(owner, "GET", `/v1/plans/${first.id}`);
      expect(saved.body).toStrictEqual(body);
    });

    it("refuses workouts with 400 and changes nothing", async () => {
      const { body: before } = await send(
        owner,
        "GET",
        `/v1/plans/${second.id}`
      );

      const { body, status } = await send(
        owner,
        "PATCH",
        `/v1/plans/${second.id}`,
        { name: "Replaced", workouts: newPlan("Replaced").workouts }
      );

      expect(status).toBe(400);
      expect(body.error.code).toBe("invalid_request");
      const after = await send(owner, "GET", `/v1/plans/${second.id}`);
      expect(after.body).toStrictEqual(before);
    });
  });

  describe("pOST /v1/plans/{id}/activate against the local stack", () => {
    it("makes the Plan active and every other Plan of the User inactive", async () => {
      await expect(activeFlags(owner)).resolves.toStrictEqual([
        [second.id, true],
        [first.id, false],
      ]);

      const { body, status } = await send(
        owner,
        "POST",
        `/v1/plans/${first.id}/activate`
      );

      expect({ body, status, workoutIds: workoutIds(body.data) }).toMatchObject(
        {
          body: { data: { id: first.id, is_active: true, weight_unit: "kg" } },
          status: 200,
          workoutIds: workoutIds(first),
        }
      );
      await expect(activeFlags(owner)).resolves.toStrictEqual([
        [second.id, false],
        [first.id, true],
      ]);
      const active = await send(owner, "GET", "/v1/plans/active");
      expect(active.body.data.id).toBe(first.id);

      // Activating the active Plan again changes nothing
      const repeated = await send(
        owner,
        "POST",
        `/v1/plans/${first.id}/activate`
      );

      const flags = await activeFlags(owner);
      expect({ flags, status: repeated.status }).toStrictEqual({
        flags: [
          [second.id, false],
          [first.id, true],
        ],
        status: 200,
      });
    });
  });

  describe("dELETE /v1/plans/{id} against the local stack", () => {
    it("answers 204, again on a repeat, then 404 everywhere, keeping its Workout Sessions", async () => {
      const doomed = await seedPlan(owner, "Doomed");

      const [workout] = doomed.workouts;

      if (!workout) {
        throw new Error("The Plan has no Workout");
      }

      const started = await asUser(owner, (tx) =>
        startWorkoutSession(tx, workout.id)
      );

      if (started.status !== "started") {
        throw new Error("The Workout Session didn't start");
      }

      const removed = await send(owner, "DELETE", `/v1/plans/${doomed.id}`);
      const repeated = await send(owner, "DELETE", `/v1/plans/${doomed.id}`);
      expect([removed, repeated]).toStrictEqual([
        { body: null, status: 204 },
        { body: null, status: 204 },
      ]);

      await expect(
        answersOf(owner, [
          ["GET", `/v1/plans/${doomed.id}`],
          ["PATCH", `/v1/plans/${doomed.id}`, { name: "Back" }],
          ["POST", `/v1/plans/${doomed.id}/activate`],
        ])
      ).resolves.toStrictEqual(allNotFound(3));
      const flags = await activeFlags(owner);
      const listed = flags.map(([id]: [string]) => id);
      expect(listed).not.toContain(doomed.id);
      // It was the active Plan (createPlan activates); deleting it clears that
      const active = await send(owner, "GET", "/v1/plans/active");
      expect(active.body).toStrictEqual({ data: null });

      const session = await send(
        owner,
        "GET",
        `/v1/workout-sessions/${started.session.id}`
      );

      expect(session).toMatchObject({
        body: { data: { id: started.session.id } },
        status: 200,
      });
    });
  });

  describe("changing Plans across Users", () => {
    it("answers 404 for another User's Plan on every route and changes nothing of theirs", async () => {
      const { body: before } = await send(
        intruder,
        "GET",
        `/v1/plans/${theirs.id}`
      );

      const ownerBefore = await activeFlags(owner);

      await expect(
        answersOf(owner, [
          ["PATCH", `/v1/plans/${theirs.id}`, { name: "Hijacked" }],
          ["POST", `/v1/plans/${theirs.id}/activate`],
          ["DELETE", `/v1/plans/${theirs.id}`],
        ])
      ).resolves.toStrictEqual(allNotFound(3));

      const after = await send(intruder, "GET", `/v1/plans/${theirs.id}`);
      expect(after.body).toStrictEqual(before);
      expect(before.data.is_active).toBeTruthy();
      // A refused activation doesn't deactivate the caller's own Plans either
      await expect(activeFlags(owner)).resolves.toStrictEqual(ownerBefore);
    });

    it("answers 404 for a Plan id nobody has, on every route", async () => {
      const missing = randomUUID();
      await expect(
        answersOf(owner, [
          ["PATCH", `/v1/plans/${missing}`, { name: "Nobody's" }],
          ["POST", `/v1/plans/${missing}/activate`],
          ["DELETE", `/v1/plans/${missing}`],
        ])
      ).resolves.toStrictEqual(allNotFound(3));
    });
  });
});
