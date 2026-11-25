import { ApiError } from "@fitme/api-client";
/**
 * The fake Public API's `DELETE /v1/workout-session-sets/{id}`, through the
 * real client: 204 whether or not anything matched, 409 for a finished Workout
 * Session, and the other sets keeping their `order` (ADR 0023).
 */
import { beforeEach, describe, expect, it } from "@jest/globals";

import { publicApi } from "~/lib/public-api";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";

const ROUTE = "DELETE /v1/workout-session-sets/{id}";

beforeEach(() => {
  backend.reset();
  backend.seed({
    exercises: [{ name: "Squat", sets: [10, null, 8] }],
    id: "open",
  });
  backend.seed({
    exercises: [{ name: "Squat", sets: [8] }],
    finished: true,
    id: "finished",
  });
});

const remove = (id: string) =>
  publicApi().DELETE("/v1/workout-session-sets/{id}", {
    params: { path: { id } },
  });

const status = async (id: string) => {
  const { response } = await remove(id);

  return response.status;
};

/** The open Workout Session's sets, as its read answers them. */
const shown = async () => {
  const { data } = await publicApi().GET("/v1/workout-sessions/{id}", {
    params: { path: { id: "open" } },
  });

  return data?.data.exercises.map(({ sets }) =>
    sets.map(({ id, order }) => [id, order])
  );
};

const all = [
  [
    ["open-e1-s1", 1],
    ["open-e1-s2", 2],
    ["open-e1-s3", 3],
  ],
];

const failure = async (pending: Promise<unknown>) => {
  try {
    await pending;
  } catch (error) {
    return error;
  }

  return null;
};

describe("the fake's DELETE /v1/workout-session-sets/{id}", () => {
  it("removes a logged set, leaving the others' order", async () => {
    await expect(status("open-e1-s1")).resolves.toBe(204);

    await expect(shown()).resolves.toEqual([
      [
        ["open-e1-s2", 2],
        ["open-e1-s3", 3],
      ],
    ]);
  });

  it("removes an unlogged set, and the next one added goes last", async () => {
    await expect(status("open-e1-s2")).resolves.toBe(204);

    await publicApi().POST("/v1/workout-session-exercises/{id}/sets", {
      body: { reps_completed: 5, weight_completed: 40 },
      params: { path: { id: "open-e1" } },
    });

    await expect(shown()).resolves.toEqual([
      [
        ["open-e1-s1", 1],
        ["open-e1-s3", 3],
        [expect.any(String), 4],
      ],
    ]);
  });

  it("keeps an Exercise whose last set goes", async () => {
    await remove("open-e1-s1");
    await remove("open-e1-s2");
    await remove("open-e1-s3");

    await expect(shown()).resolves.toEqual([[]]);
  });

  it("answers 204 for a repeat and a missing id, removing nothing more", async () => {
    await expect(status("open-e1-s3")).resolves.toBe(204);
    await expect(status("open-e1-s3")).resolves.toBe(204);
    await expect(status("nowhere")).resolves.toBe(204);

    await expect(shown()).resolves.toEqual([all[0].slice(0, 2)]);
  });

  it("answers 204 for another User's set and leaves it untouched", async () => {
    backend.seed({
      exercises: [{ name: "Squat", sets: [5] }],
      id: "theirs",
      userId: "user_other",
    });

    await expect(status("theirs-e1-s1")).resolves.toBe(204);

    expect(backend.sets.map(({ id }) => id)).toContain("theirs-e1-s1");
  });

  it("answers 409 session_finished for a finished Workout Session, removing nothing", async () => {
    await expect(failure(remove("finished-e1-s1"))).resolves.toMatchObject({
      code: "session_finished",
      status: 409,
    });

    expect(backend.sets.map(({ id }) => id)).toContain("finished-e1-s1");
  });

  it("fails on demand: a status, a 429 and a network failure remove nothing", async () => {
    fakePublicApi.failNext(ROUTE, { status: 500 });
    fakePublicApi.failNext(ROUTE, { retryAfterSeconds: 7, status: 429 });
    fakePublicApi.failNext(ROUTE, "network");

    const failed = await failure(remove("open-e1-s1"));
    expect(failed).toBeInstanceOf(ApiError);
    expect(failed).toMatchObject({ status: 500 });
    await expect(failure(remove("open-e1-s1"))).resolves.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 7,
    });
    await expect(failure(remove("open-e1-s1"))).resolves.toMatchObject({
      status: null,
    });

    await expect(shown()).resolves.toEqual(all);
    expect(fakePublicApi.count(ROUTE)).toBe(3);
  });

  it("removes the set when the answer is lost", async () => {
    fakePublicApi.failNext(ROUTE, "lost");

    await expect(failure(remove("open-e1-s3"))).resolves.toMatchObject({
      status: null,
    });
    await expect(shown()).resolves.toEqual([all[0].slice(0, 2)]);
  });

  it("is held while paused", async () => {
    const resume = fakePublicApi.pause(ROUTE);
    const pending = status("open-e1-s3");

    // A read sent later is answered while the removal is still held.
    await expect(shown()).resolves.toEqual(all);

    resume();
    await expect(pending).resolves.toBe(204);
    await expect(shown()).resolves.toEqual([all[0].slice(0, 2)]);
  });
});
