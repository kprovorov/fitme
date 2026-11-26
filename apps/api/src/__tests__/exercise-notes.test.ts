import { MAX_EXERCISE_SLUG_LENGTH, MAX_NOTE_LENGTH } from "@fitme/core/limits";
import type { SetExerciseNoteInput } from "@fitme/services/exercise-notes";
import { describe, expect, it } from "vitest";

import { fakeServices, signedInAs, testApp } from "../test/harness.js";

type App = ReturnType<typeof testApp>["app"];

const UPDATED_AT = "2026-11-26T10:00:00.123456+00:00";

const put = (app: App, slug: string, body: unknown, user = "user_alice") =>
  app.request(`/v1/exercise-notes/${slug}`, {
    body: JSON.stringify(body),
    headers: { ...signedInAs(user), "content-type": "application/json" },
    method: "PUT",
  });

/** A facade whose `setExerciseNote` saves the cleaned text and records each call. */
const savingNotes = () => {
  const calls: SetExerciseNoteInput[] = [];

  const services = fakeServices({
    setExerciseNote: (input) => {
      calls.push(input);
      const note = input.note.trim();

      return Promise.resolve({
        note:
          note === ""
            ? null
            : {
                exercise_slug: input.exerciseSlug,
                note,
                updated_at: UPDATED_AT,
              },
        status: "saved",
      });
    },
  });

  return { calls, services };
};

describe("gET /v1/exercise-notes", () => {
  it("answers every Exercise note of the caller, unpaged", async () => {
    const notes = [
      {
        exercise_slug: "barbell-back-squat",
        note: "Feet shoulder width\nBar low",
        updated_at: UPDATED_AT,
      },
      {
        exercise_slug: "leg-press",
        note: "Seat on hole 4",
        updated_at: UPDATED_AT,
      },
    ];

    const services = fakeServices({
      listExerciseNotes: () => Promise.resolve(notes),
    });

    const { app, servicesFor } = testApp({ services });

    const response = await app.request("/v1/exercise-notes", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ data: notes });
    expect(servicesFor).toStrictEqual(["user_alice"]);
  });

  it("answers an empty list for a User without notes", async () => {
    const services = fakeServices({
      listExerciseNotes: () => Promise.resolve([]),
    });

    const { app } = testApp({ services });

    const response = await app.request("/v1/exercise-notes", {
      headers: signedInAs("user_alice"),
    });

    await expect(response.json()).resolves.toStrictEqual({ data: [] });
  });

  it("answers 401 without a session token", async () => {
    const { app, servicesFor } = testApp();

    const response = await app.request("/v1/exercise-notes");

    expect(response.status).toBe(401);
    expect(servicesFor).toStrictEqual([]);
  });
});

describe("pUT /v1/exercise-notes/:slug", () => {
  it("saves the note and answers it as saved", async () => {
    const { calls, services } = savingNotes();
    const { app, servicesFor } = testApp({ services });

    const response = await put(app, "barbell-back-squat", {
      note: "  Bar low\nFeet wide  ",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: {
        exercise_slug: "barbell-back-squat",
        note: "Bar low\nFeet wide",
        updated_at: UPDATED_AT,
      },
    });
    expect(calls).toStrictEqual([
      { exerciseSlug: "barbell-back-squat", note: "  Bar low\nFeet wide  " },
    ]);
    expect(servicesFor).toStrictEqual(["user_alice"]);
  });

  it("answers the same for a repeat", async () => {
    const { services } = savingNotes();
    const { app } = testApp({ services });

    const first = await put(app, "barbell-back-squat", { note: "Bar low" });
    const second = await put(app, "barbell-back-squat", { note: "Bar low" });

    await expect(second.json()).resolves.toStrictEqual(await first.json());
  });

  it("sends no expected note, so the last save wins", async () => {
    const { calls, services } = savingNotes();
    const { app } = testApp({ services });

    await put(app, "barbell-back-squat", { note: "Bar low" });

    expect(calls[0]).not.toHaveProperty("expectedNote");
  });

  it.each([
    ["an empty note", ""],
    ["a blank note", " \n\t "],
  ])("clears the note for %s, answering note null", async (_, note) => {
    const { calls, services } = savingNotes();
    const { app } = testApp({ services });

    const response = await put(app, "barbell-back-squat", { note });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: {
        exercise_slug: "barbell-back-squat",
        note: null,
        updated_at: null,
      },
    });
    expect(calls).toStrictEqual([{ exerciseSlug: "barbell-back-squat", note }]);
  });

  it("clears a note on an Exercise the Library doesn't have, unchecked", async () => {
    const { calls, services } = savingNotes();
    const { app, reported } = testApp({ services });

    const response = await put(app, "made-up-press", { note: "" });

    expect(response.status).toBe(200);
    expect(calls).toStrictEqual([{ exerciseSlug: "made-up-press", note: "" }]);
    expect(reported).toStrictEqual([]);
  });

  it("clears a note while the Library can't load, unchecked", async () => {
    const { calls, services } = savingNotes();

    const { app, reported } = testApp({
      exerciseLibraryLoads: "fail",
      services,
    });

    const response = await put(app, "barbell-back-squat", { note: "   " });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(reported).toStrictEqual([]);
  });

  it("answers 400 unknown_exercises naming the slug, before any service call, unreported", async () => {
    // setExerciseNote isn't faked: calling it would fail the request with a 500
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await put(app, "made-up-press", { note: "Bar low" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toStrictEqual({
      error: {
        code: "unknown_exercises",
        message: "Unknown exercise_slug(s): made-up-press",
      },
    });
    expect(reported).toStrictEqual([]);
  });

  it("answers a reported 503 library_unavailable when the new Library can't load, before any service call", async () => {
    const { app, exerciseLibrary, reported } = testApp({
      exerciseLibraryLoads: "fail",
      services: fakeServices({}),
    });

    const response = await put(app, "barbell-back-squat", { note: "Bar low" });

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("library_unavailable");
    expect(reported).toStrictEqual([exerciseLibrary.state.outage]);
  });

  it("saves a note on an old slug under the Exercise replacing it", async () => {
    const { calls, services } = savingNotes();
    const { app } = testApp({ services });

    const response = await put(app, "bench-press", { note: "Arch" });

    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.exercise_slug).toBe("barbell-bench-press");
    expect(calls).toStrictEqual([
      { exerciseSlug: "barbell-bench-press", note: "Arch" },
    ]);
  });

  it("takes a note at the limit, counted once trimmed and by code point", async () => {
    const { services } = savingNotes();
    const { app } = testApp({ services });

    const atLimit = `  ${"💪".repeat(MAX_NOTE_LENGTH)}  `;

    const response = await put(app, "barbell-back-squat", { note: atLimit });

    expect(response.status).toBe(200);
  });

  it.each([
    ["a note over the limit", { note: "a".repeat(MAX_NOTE_LENGTH + 1) }],
    ["a NUL character", { note: "Bar\u0000low" }],
    ["a missing note", {}],
    ["a note that isn't a string", { note: 5 }],
    ["a null note", { note: null }],
    ["an unknown field", { expected_note: "Bar", note: "Bar low" }],
  ])(
    "answers 400 invalid_request for %s, before any service call, unreported",
    async (_, body) => {
      const { app, reported } = testApp({ services: fakeServices({}) });

      const response = await put(app, "barbell-back-squat", body);

      expect(response.status).toBe(400);
      const answer = await response.json();
      expect(answer.error.code).toBe("invalid_request");
      expect(reported).toStrictEqual([]);
    }
  );

  it("never repeats the note's text in its refusal", async () => {
    const { app } = testApp({ services: fakeServices({}) });

    const secret = `left shoulder clicked ${"x".repeat(MAX_NOTE_LENGTH)}`;
    const response = await put(app, "barbell-back-squat", { note: secret });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.not.toContain("shoulder");
  });

  it.each([
    ["uppercase letters", "Barbell-Squat"],
    ["a double hyphen", "barbell--squat"],
    ["one too long", "a".repeat(MAX_EXERCISE_SLUG_LENGTH + 1)],
  ])(
    "answers 400 invalid_request for a slug with %s, unreported",
    async (_, slug) => {
      const { app, reported } = testApp({ services: fakeServices({}) });

      const response = await put(app, slug, { note: "" });

      expect(response.status).toBe(400);
      const answer = await response.json();
      expect(answer.error.code).toBe("invalid_request");
      expect(reported).toStrictEqual([]);
    }
  );

  it("answers 415 for a body that isn't JSON, unreported", async () => {
    const { app, reported } = testApp({ services: fakeServices({}) });

    const response = await app.request(
      "/v1/exercise-notes/barbell-back-squat",
      {
        body: "note=Bar",
        headers: {
          ...signedInAs("user_alice"),
          "content-type": "text/plain",
        },
        method: "PUT",
      }
    );

    expect(response.status).toBe(415);
    expect(reported).toStrictEqual([]);
  });
});
