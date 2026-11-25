import { ApiError } from "@fitme/api-client";
/**
 * The fake Public API's `DELETE /v1/workout-sessions/{id}`, through the real
 * client, as discarding a Workout Session will reach it: a hard delete
 * answering 204 whether or not anything matched.
 */
import { beforeEach, describe, expect, it } from "@jest/globals";

import { publicApi } from "~/lib/public-api";
import { fakeExercise, serveExercises } from "~/test-utils/fake-exercises";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";

const ROUTE = "DELETE /v1/workout-sessions/{id}";

beforeEach(() => {
  backend.reset();
  serveExercises([fakeExercise("squat")]);
  backend.seedPlan({
    id: "plan-1",
    name: "Full body",
    workouts: [
      { exercises: [{ sets: 1, slug: "squat" }], id: "day-a", name: "Day A" },
      { exercises: [{ sets: 1, slug: "squat" }], id: "day-b", name: "Day B" },
    ],
  });
  backend.seed({
    exercises: [{ name: "Squat", sets: [10, null] }],
    id: "open",
    workoutId: "day-a",
  });
  backend.seed({
    exercises: [{ name: "Squat", sets: [8] }],
    finished: true,
    id: "finished",
    workoutId: "day-b",
  });
  backend.personalRecords.push({
    exercise_slug: "squat",
    kind: "reps",
    reps: 8,
    weight: 0,
    workout_session_id: "finished",
  });
});

const remove = (id: string) =>
  publicApi().DELETE("/v1/workout-sessions/{id}", { params: { path: { id } } });

const status = async (id: string) => {
  const { response } = await remove(id);

  return response.status;
};

const read = (id: string) =>
  publicApi().GET("/v1/workout-sessions/{id}", { params: { path: { id } } });

const listed = async () => {
  const { data } = await publicApi().GET("/v1/workout-sessions");

  return data?.data.map(({ id }) => id);
};

const history = async () => {
  const { data } = await publicApi().GET("/v1/workout-session-exercises", {
    params: { query: { exercise_slug: "squat" } },
  });

  return data?.data.map(({ session }) => session.id);
};

const failure = async (pending: Promise<unknown>) => {
  try {
    await pending;
  } catch (error) {
    return error;
  }

  return null;
};

describe("the fake's DELETE /v1/workout-sessions/{id}", () => {
  it("deletes an open Workout Session, so its reads leave it out and another Workout starts", async () => {
    await expect(status("open")).resolves.toBe(204);

    await expect(failure(read("open"))).resolves.toMatchObject({ status: 404 });
    await expect(listed()).resolves.toEqual(["finished"]);
    await expect(history()).resolves.toEqual(["finished"]);
    expect(backend.exercises.map(({ id }) => id)).toEqual(["finished-e1"]);
    expect(backend.sets.map(({ id }) => id)).toEqual(["finished-e1-s1"]);
    expect(backend.personalRecords).toHaveLength(1);

    const started = await publicApi().POST("/v1/workout-sessions", {
      body: { workout_id: "day-b" },
    });

    expect(started.response.status).toBe(201);
  });

  it("deletes a finished Workout Session with its Personal records", async () => {
    await expect(status("finished")).resolves.toBe(204);

    await expect(failure(read("finished"))).resolves.toMatchObject({
      status: 404,
    });
    await expect(listed()).resolves.toEqual(["open"]);
    await expect(history()).resolves.toEqual(["open"]);
    expect(backend.personalRecords).toEqual([]);
  });

  it("answers 204 for a repeat and a missing id, deleting nothing more", async () => {
    await expect(status("open")).resolves.toBe(204);
    await expect(status("open")).resolves.toBe(204);
    await expect(status("nowhere")).resolves.toBe(204);

    await expect(listed()).resolves.toEqual(["finished"]);
    expect(backend.sets).toHaveLength(1);
  });

  it("answers 204 for another User's Workout Session and leaves it untouched", async () => {
    backend.seed({
      exercises: [{ name: "Squat", sets: [5] }],
      finished: true,
      id: "theirs",
      userId: "user_other",
    });
    backend.personalRecords.push({
      exercise_slug: "squat",
      kind: "reps",
      reps: 5,
      weight: 0,
      workout_session_id: "theirs",
    });

    await expect(status("theirs")).resolves.toBe(204);

    expect(backend.session("theirs")).toBeDefined();
    expect(backend.exercises.map(({ id }) => id)).toContain("theirs-e1");
    expect(backend.sets.map(({ id }) => id)).toContain("theirs-e1-s1");
    expect(
      backend.personalRecords.map((record) => record.workout_session_id)
    ).toContain("theirs");
  });

  it("fails on demand: a status, a 429 and a network failure delete nothing", async () => {
    fakePublicApi.failNext(ROUTE, { status: 500 });
    fakePublicApi.failNext(ROUTE, { retryAfterSeconds: 7, status: 429 });
    fakePublicApi.failNext(ROUTE, "network");

    const failed = await failure(remove("open"));
    expect(failed).toBeInstanceOf(ApiError);
    expect(failed).toMatchObject({ status: 500 });
    await expect(failure(remove("open"))).resolves.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 7,
    });
    await expect(failure(remove("open"))).resolves.toMatchObject({
      status: null,
    });

    expect(backend.session("open")).toBeDefined();
    expect(fakePublicApi.count(ROUTE)).toBe(3);
  });

  it("deletes the Workout Session when the answer is lost", async () => {
    fakePublicApi.failNext(ROUTE, "lost");

    await expect(failure(remove("open"))).resolves.toMatchObject({
      status: null,
    });
    expect(backend.session("open")).toBeUndefined();
  });

  it("is held while paused", async () => {
    const resume = fakePublicApi.pause(ROUTE);
    const pending = status("open");

    // A read sent later is answered while the delete is still held.
    await read("open");
    expect(backend.session("open")).toBeDefined();

    resume();
    await expect(pending).resolves.toBe(204);
    expect(backend.session("open")).toBeUndefined();
  });
});
