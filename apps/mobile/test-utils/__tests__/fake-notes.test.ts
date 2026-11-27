import { ApiError } from "@fitme/api-client";
import { MAX_NOTE_LENGTH } from "@fitme/core";
/**
 * The fake Public API's note routes, through the real client:
 * `GET` / `PUT /v1/exercise-notes`, `PUT /v1/workout-session-sets/{id}/note`,
 * and the `note` every set carries in a Workout Session and Exercise history.
 */
import { beforeEach, describe, expect, it } from "@jest/globals";

import { publicApi } from "~/lib/public-api";
import {
  EXERCISES_UNAVAILABLE,
  failExercises,
  fakeExercise,
  serveExercises,
} from "~/test-utils/fake-exercises";
import { backend, fakePublicApi } from "~/test-utils/fake-public-api";

const EXERCISE_NOTE_ROUTE = "PUT /v1/exercise-notes/{slug}";
const SET_NOTE_ROUTE = "PUT /v1/workout-session-sets/{id}/note";

beforeEach(() => {
  backend.reset();
  serveExercises([fakeExercise("leg-press"), fakeExercise("squat")], {
    replacedSlugs: { "old-squat": "squat" },
  });
  backend.seedProfile("user_test");
  backend.seed({
    exercises: [{ name: "Squat", notes: ["Knees out"], sets: [10, null, 0] }],
    id: "open",
  });
  backend.seed({
    exercises: [{ name: "Squat", sets: [8] }],
    finished: true,
    id: "finished",
    startedAt: "2026-10-01T10:00:00.000Z",
  });
  backend.seed({
    exercises: [{ name: "Squat", notes: ["Theirs"], sets: [5] }],
    id: "theirs",
    userId: "user_other",
  });
});

const failure = async (pending: Promise<unknown>) => {
  try {
    await pending;
  } catch (error) {
    return error;
  }

  return null;
};

const listNotes = async () => {
  const { data } = await publicApi().GET("/v1/exercise-notes");

  return data?.data;
};

const saveExerciseNote = async (slug: string, note: string) => {
  const { data } = await publicApi().PUT("/v1/exercise-notes/{slug}", {
    body: { note },
    params: { path: { slug } },
  });

  return data?.data;
};

const saveSetNote = async (id: string, note: string) => {
  const { data } = await publicApi().PUT("/v1/workout-session-sets/{id}/note", {
    body: { note },
    params: { path: { id } },
  });

  return data?.data;
};

/** Each set's note in a Workout Session, as its read answers them. */
const sessionNotes = async (id: string) => {
  const { data } = await publicApi().GET("/v1/workout-sessions/{id}", {
    params: { path: { id } },
  });

  return data?.data.exercises.map(({ sets }) =>
    sets.map(({ id: setId, note }) => [setId, note])
  );
};

describe("the fake's Exercise notes", () => {
  it("answers the seeded notes by slug, never another User's", async () => {
    backend.seedExerciseNote("squat", "Bar on traps");
    backend.seedExerciseNote("leg-press", "Seat on hole 4", {
      updatedAt: "2026-10-02T09:00:00.000Z",
    });
    backend.seedExerciseNote("squat", "Not yours", { userId: "user_other" });

    await expect(listNotes()).resolves.toEqual([
      {
        exercise_slug: "leg-press",
        note: "Seat on hole 4",
        updated_at: "2026-10-02T09:00:00.000Z",
      },
      {
        exercise_slug: "squat",
        note: "Bar on traps",
        updated_at: "2026-10-08T09:00:00.000Z",
      },
    ]);
  });

  it("saves a note trimmed, line breaks kept, and reads it back", async () => {
    const saved = await saveExerciseNote("leg-press", "  Seat 4\nFeet high \n");

    expect(saved).toMatchObject({
      exercise_slug: "leg-press",
      note: "Seat 4\nFeet high",
    });
    expect(saved?.updated_at).toEqual(expect.any(String));
    expect(backend.exerciseNote("leg-press")).toBe("Seat 4\nFeet high");
    await expect(listNotes()).resolves.toEqual([saved]);
  });

  it("replaces a note, and a repeat answers the same", async () => {
    backend.seedExerciseNote("squat", "Old");

    const first = await saveExerciseNote("squat", "New");
    const repeat = await saveExerciseNote("squat", "New");

    expect(repeat).toEqual(first);
    expect(backend.exerciseNotes).toHaveLength(1);
    expect(backend.exerciseNote("squat")).toBe("New");
  });

  it("saves an old slug's note under its replacement", async () => {
    await expect(saveExerciseNote("old-squat", "Wide")).resolves.toMatchObject({
      exercise_slug: "squat",
      note: "Wide",
    });
    expect(backend.exerciseNote("squat")).toBe("Wide");
  });

  it("clears on blank text, unchecked against the served Exercises", async () => {
    backend.seedExerciseNote("gone-exercise", "Old");
    backend.seedExerciseNote("gone-exercise", "Not yours", {
      userId: "user_other",
    });
    failExercises(EXERCISES_UNAVAILABLE);

    await expect(saveExerciseNote("gone-exercise", " \n ")).resolves.toEqual({
      exercise_slug: "gone-exercise",
      note: null,
      updated_at: null,
    });
    expect(backend.exerciseNote("gone-exercise")).toBeUndefined();
    expect(backend.exerciseNote("gone-exercise", "user_other")).toBe(
      "Not yours"
    );
  });

  it("refuses an unknown slug and a Library outage, writing nothing", async () => {
    await expect(
      failure(saveExerciseNote("deadlift", "Hook grip"))
    ).resolves.toMatchObject({ code: "unknown_exercises", status: 400 });

    failExercises(EXERCISES_UNAVAILABLE);

    await expect(
      failure(saveExerciseNote("squat", "Bar on traps"))
    ).resolves.toMatchObject({ code: "library_unavailable", status: 503 });
    expect(backend.exerciseNotes).toEqual([]);
  });

  it("refuses a note over the limit, a NUL and a malformed body or slug", async () => {
    const tooLong = "a".repeat(MAX_NOTE_LENGTH + 1);

    const refused = await Promise.all(
      [
        saveExerciseNote("squat", tooLong),
        saveExerciseNote("squat", "a\u0000b"),
        saveExerciseNote("Not A Slug", "Bar on traps"),
        publicApi().PUT("/v1/exercise-notes/{slug}", {
          body: { extra: true, note: "Bar" },
          params: { path: { slug: "squat" } },
        }),
      ].map(failure)
    );

    for (const refusal of refused) {
      expect(refusal).toBeInstanceOf(ApiError);
      expect(refusal).toMatchObject({ code: "invalid_request", status: 400 });
      expect((refusal as ApiError).message).not.toContain("aaa");
    }

    expect(backend.exerciseNotes).toEqual([]);

    await expect(
      saveExerciseNote("squat", ` ${"a".repeat(MAX_NOTE_LENGTH)} `)
    ).resolves.toMatchObject({ note: "a".repeat(MAX_NOTE_LENGTH) });
  });

  it("fails on demand and is held while paused", async () => {
    fakePublicApi.failNext(EXERCISE_NOTE_ROUTE, {
      retryAfterSeconds: 7,
      status: 429,
    });
    fakePublicApi.failNext("GET /v1/exercise-notes", "network");

    await expect(
      failure(saveExerciseNote("squat", "Bar"))
    ).resolves.toMatchObject({ code: "rate_limited", retryAfterSeconds: 7 });
    await expect(failure(listNotes())).resolves.toMatchObject({
      status: null,
    });
    expect(backend.exerciseNotes).toEqual([]);

    const resume = fakePublicApi.pause(EXERCISE_NOTE_ROUTE);
    const pending = saveExerciseNote("squat", "Bar");

    await expect(listNotes()).resolves.toEqual([]);

    resume();
    await expect(pending).resolves.toMatchObject({ note: "Bar" });
    expect(fakePublicApi.count(EXERCISE_NOTE_ROUTE)).toBe(2);
    expect(
      fakePublicApi.requests.filter(
        ({ route }) => route === EXERCISE_NOTE_ROUTE
      )
    ).toEqual([
      expect.objectContaining({
        body: { note: "Bar" },
        path: "/v1/exercise-notes/squat",
      }),
      expect.objectContaining({
        body: { note: "Bar" },
        path: "/v1/exercise-notes/squat",
      }),
    ]);
  });
});

describe("the fake's set notes", () => {
  it("answers note on every set of a Workout Session", async () => {
    await expect(sessionNotes("open")).resolves.toEqual([
      [
        ["open-e1-s1", "Knees out"],
        ["open-e1-s2", null],
        ["open-e1-s3", null],
      ],
    ]);
  });

  it("saves a logged set's note, a bodyweight one included, changing nothing else", async () => {
    const before = backend.sets.find(({ id }) => id === "open-e1-s3");
    const { logged_at: loggedAt, reps_completed: reps } = { ...before };

    await expect(
      saveSetNote("open-e1-s3", "  Felt easy \n")
    ).resolves.toMatchObject({
      id: "open-e1-s3",
      logged_at: loggedAt,
      note: "Felt easy",
      reps_completed: reps,
      weight_unit: "kg",
    });
    await expect(sessionNotes("open")).resolves.toEqual([
      [
        ["open-e1-s1", "Knees out"],
        ["open-e1-s2", null],
        ["open-e1-s3", "Felt easy"],
      ],
    ]);
  });

  it("clears on blank text", async () => {
    await expect(saveSetNote("open-e1-s1", "   ")).resolves.toMatchObject({
      note: null,
    });
    expect(backend.sets.find(({ id }) => id === "open-e1-s1")?.note).toBeNull();
  });

  it("takes a note on a finished Workout Session's set", async () => {
    await expect(saveSetNote("finished-e1-s1", "PR?")).resolves.toMatchObject({
      note: "PR?",
    });
    await expect(sessionNotes("finished")).resolves.toEqual([
      [["finished-e1-s1", "PR?"]],
    ]);
  });

  it("refuses an unlogged set, a missing one and another User's", async () => {
    await expect(
      failure(saveSetNote("open-e1-s2", "Later"))
    ).resolves.toMatchObject({ code: "set_not_logged", status: 409 });
    await expect(
      failure(saveSetNote("missing", "Later"))
    ).resolves.toMatchObject({ code: "not_found", status: 404 });
    await expect(
      failure(saveSetNote("theirs-e1-s1", "Mine now"))
    ).resolves.toMatchObject({ code: "not_found", status: 404 });

    expect(backend.sets.find(({ id }) => id === "open-e1-s2")?.note).toBeNull();
    expect(backend.sets.find(({ id }) => id === "theirs-e1-s1")?.note).toBe(
      "Theirs"
    );
  });

  it("refuses a note over the limit and a NUL", async () => {
    await expect(
      failure(saveSetNote("open-e1-s1", "a".repeat(MAX_NOTE_LENGTH + 1)))
    ).resolves.toMatchObject({ code: "invalid_request", status: 400 });
    await expect(
      failure(saveSetNote("open-e1-s1", "a\u0000b"))
    ).resolves.toMatchObject({ code: "invalid_request", status: 400 });
    expect(backend.sets.find(({ id }) => id === "open-e1-s1")?.note).toBe(
      "Knees out"
    );
  });

  it("keeps the note through a reps edit and an Exercise replacement", async () => {
    await publicApi().PATCH("/v1/workout-session-sets/{id}", {
      body: { reps_completed: 12, weight_completed: 40 },
      params: { path: { id: "open-e1-s1" } },
    });

    const { data } = await publicApi().PUT(
      "/v1/workout-session-exercises/{id}",
      {
        body: { exercise_slug: "leg-press" },
        params: { path: { id: "open-e1" } },
      }
    );

    expect(data?.data.sets[0]).toMatchObject({
      note: "Knees out",
      reps_completed: 12,
    });
  });

  it("removes the note with its set", async () => {
    await publicApi().DELETE("/v1/workout-session-sets/{id}", {
      params: { path: { id: "open-e1-s1" } },
    });

    await expect(sessionNotes("open")).resolves.toEqual([
      [
        ["open-e1-s2", null],
        ["open-e1-s3", null],
      ],
    ]);
    expect(backend.sets.some(({ note }) => note === "Knees out")).toBe(false);
  });

  it("answers note in Exercise history", async () => {
    await saveSetNote("finished-e1-s1", "Heavy");

    const { data } = await publicApi().GET("/v1/workout-session-exercises", {
      params: { query: { exercise_slug: "squat" } },
    });

    expect(
      data?.data.map(({ sets }) => sets.map(({ id, note }) => [id, note]))
    ).toEqual([
      [
        ["open-e1-s1", "Knees out"],
        ["open-e1-s3", null],
      ],
      [["finished-e1-s1", "Heavy"]],
    ]);
  });

  it("fails on demand, is held while paused, and records the request", async () => {
    fakePublicApi.failNext(SET_NOTE_ROUTE, { status: 500 });

    await expect(
      failure(saveSetNote("open-e1-s1", "New"))
    ).resolves.toMatchObject({ status: 500 });
    expect(backend.sets.find(({ id }) => id === "open-e1-s1")?.note).toBe(
      "Knees out"
    );

    const resume = fakePublicApi.pause(SET_NOTE_ROUTE);
    const pending = saveSetNote("open-e1-s1", "New");

    await expect(sessionNotes("open")).resolves.toEqual([
      [
        ["open-e1-s1", "Knees out"],
        ["open-e1-s2", null],
        ["open-e1-s3", null],
      ],
    ]);

    resume();
    await expect(pending).resolves.toMatchObject({ note: "New" });
    expect(fakePublicApi.count(SET_NOTE_ROUTE)).toBe(2);
    expect(
      fakePublicApi.requests.findLast(({ route }) => route === SET_NOTE_ROUTE)
    ).toMatchObject({
      body: { note: "New" },
      path: "/v1/workout-session-sets/open-e1-s1/note",
      route: SET_NOTE_ROUTE,
    });
  });
});
