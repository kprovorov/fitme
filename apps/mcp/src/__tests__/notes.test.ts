import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import type {
  ExerciseNote,
  SetExerciseNoteInput,
} from "@fitme/services/exercise-notes";
import type {
  SetWorkoutSessionSetNoteInput,
  WorkoutSessionSet,
} from "@fitme/services/workout-sessions";
import { describe, expect, it, vi } from "vitest";

import type { UserServices } from "../services.js";
import {
  call,
  connect,
  connectWithServices,
  recordingReporter,
  SET_ID,
  testLibrary,
} from "./harness.js";

const UNAVAILABLE = "Library unavailable, try again.";

const UPDATED_AT = "2026-11-26T10:00:00+00:00";

const noteOn = (exercise_slug: string, note: string): ExerciseNote => ({
  exercise_slug,
  note,
  updated_at: UPDATED_AT,
});

const savedOn =
  (exercise_slug: string) =>
  ({ note }: SetExerciseNoteInput) => {
    const text = note.trim();

    return Promise.resolve({
      note: text === "" ? null : noteOn(exercise_slug, text),
      status: "saved" as const,
    });
  };

describe("list_exercise_notes", () => {
  it("lists every note with its Exercise named from the Library", async () => {
    const client = await connectWithServices({
      listExerciseNotes: () =>
        Promise.resolve([
          noteOn("barbell-back-squat", "Feet shoulder width"),
          noteOn("bench-press", "Seat on hole 4"),
        ]),
    });

    const result = await call(client, "list_exercise_notes");

    expect(result.json).toStrictEqual({
      notes: [
        {
          exercise_slug: "barbell-back-squat",
          muscle_groups: ["quadriceps", "glutes"],
          name: "Barbell Back Squat",
          note: "Feet shoulder width",
          updated_at: UPDATED_AT,
        },
        {
          exercise_slug: "bench-press",
          muscle_groups: ["chest"],
          name: "Bench Press",
          note: "Seat on hole 4",
          updated_at: UPDATED_AT,
        },
      ],
    });
  });

  it("still answers, with names from slugs, when the Library can't load", async () => {
    const { reportError } = recordingReporter();

    const client = await connectWithServices(
      {
        listExerciseNotes: () =>
          Promise.resolve([noteOn("leg-press", "Seat on 4")]),
      },
      reportError,
      testLibrary({ loads: "fail", reportError })
    );

    const result = await call(client, "list_exercise_notes");

    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual({
      notes: [
        {
          exercise_slug: "leg-press",
          muscle_groups: [],
          name: "Leg press",
          note: "Seat on 4",
          updated_at: UPDATED_AT,
        },
      ],
    });
  });

  it("answers an empty list for a User without notes", async () => {
    const client = await connectWithServices({
      listExerciseNotes: () => Promise.resolve([]),
    });

    await expect(call(client, "list_exercise_notes")).resolves.toMatchObject({
      json: { notes: [] },
    });
  });
});

describe("set_exercise_note", () => {
  it("saves the whole text with the note as read, and answers it named", async () => {
    const setExerciseNote = vi.fn<UserServices["setExerciseNote"]>(
      savedOn("bench-press")
    );

    const client = await connectWithServices({ setExerciseNote });

    const result = await call(client, "set_exercise_note", {
      exerciseSlug: "bench-press",
      expectedNote: "",
      note: "Seat on hole 4\nFeet up",
    });

    expect(setExerciseNote).toHaveBeenCalledWith({
      exerciseSlug: "bench-press",
      expectedNote: "",
      note: "Seat on hole 4\nFeet up",
    });
    expect(result.json).toStrictEqual({
      note: {
        exercise_slug: "bench-press",
        muscle_groups: ["chest"],
        name: "Bench Press",
        note: "Seat on hole 4\nFeet up",
        updated_at: UPDATED_AT,
      },
    });
  });

  it("stores a replaced slug under the Exercise replacing it", async () => {
    const setExerciseNote = vi.fn<UserServices["setExerciseNote"]>(
      savedOn("bench-press")
    );

    const client = await connectWithServices(
      { setExerciseNote },
      undefined,
      testLibrary({ replacedSlugs: { "flat-bench": "bench-press" } })
    );

    await call(client, "set_exercise_note", {
      exerciseSlug: "flat-bench",
      expectedNote: "",
      note: "Seat on hole 4",
    });

    expect(setExerciseNote).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseSlug: "bench-press" })
    );
  });

  it("clears a note under the slug sent, a replaced one included", async () => {
    const setExerciseNote = vi.fn<UserServices["setExerciseNote"]>(
      savedOn("flat-bench")
    );

    const client = await connectWithServices(
      { setExerciseNote },
      undefined,
      testLibrary({ replacedSlugs: { "flat-bench": "bench-press" } })
    );

    await call(client, "set_exercise_note", {
      exerciseSlug: "flat-bench",
      expectedNote: "Seat on hole 4",
      note: "",
    });

    expect(setExerciseNote).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseSlug: "flat-bench" })
    );
  });

  it("refuses, unreported, a note that changed since it was read, showing it", async () => {
    const { reportError, reported } = recordingReporter();

    const client = await connectWithServices(
      {
        setExerciseNote: () =>
          Promise.resolve({
            note: noteOn("bench-press", "Seat on hole 5"),
            status: "conflict",
          }),
      },
      reportError
    );

    const result = await call(client, "set_exercise_note", {
      exerciseSlug: "bench-press",
      expectedNote: "Seat on hole 4",
      note: "Seat on hole 4, feet up",
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toContain("has changed since it was read");
    expect(result.text).toContain("Seat on hole 5");
    expect(reported).toStrictEqual([]);
  });

  it("says when the note it expected has been cleared meanwhile", async () => {
    const client = await connectWithServices({
      setExerciseNote: () =>
        Promise.resolve({ note: null, status: "conflict" }),
    });

    const result = await call(client, "set_exercise_note", {
      exerciseSlug: "bench-press",
      expectedNote: "Seat on hole 4",
      note: "Seat on hole 5",
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toContain("There is no note on it now");
  });

  it("succeeds on a repeat of a write that already landed", async () => {
    const client = await connectWithServices({
      setExerciseNote: savedOn("bench-press"),
    });

    const args = {
      exerciseSlug: "bench-press",
      expectedNote: "",
      note: "Seat on hole 4",
    };

    const first = await call(client, "set_exercise_note", args);
    const again = await call(client, "set_exercise_note", args);

    expect(again).toStrictEqual(first);
    expect(again.isError).toBeFalsy();
  });

  it("clears with empty text, answering no note", async () => {
    const setExerciseNote = vi.fn<UserServices["setExerciseNote"]>(
      savedOn("bench-press")
    );

    const client = await connectWithServices({ setExerciseNote });

    const result = await call(client, "set_exercise_note", {
      exerciseSlug: "bench-press",
      expectedNote: "Seat on hole 4",
      note: "   ",
    });

    expect(result.json).toStrictEqual({ note: null });
    expect(setExerciseNote).toHaveBeenCalledOnce();
  });

  it("refuses, unreported, an Exercise the Library doesn't know, naming it", async () => {
    const { reportError, reported } = recordingReporter();

    const setExerciseNote = vi.fn<UserServices["setExerciseNote"]>(
      savedOn("leg-press")
    );

    const client = await connectWithServices({ setExerciseNote }, reportError);

    const result = await call(client, "set_exercise_note", {
      exerciseSlug: "leg-press",
      expectedNote: "",
      note: "Seat on 4",
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toContain("leg-press");
    expect(setExerciseNote).not.toHaveBeenCalled();
    expect(reported).toStrictEqual([]);
  });

  it("answers the Library error when it can't load, writing nothing", async () => {
    const setExerciseNote = vi.fn<UserServices["setExerciseNote"]>(
      savedOn("bench-press")
    );

    const client = await connectWithServices(
      { setExerciseNote },
      undefined,
      testLibrary({ loads: "fail" })
    );

    const result = await call(client, "set_exercise_note", {
      exerciseSlug: "bench-press",
      expectedNote: "",
      note: "Seat on hole 4",
    });

    expect(result).toMatchObject({ isError: true, text: UNAVAILABLE });
    expect(setExerciseNote).not.toHaveBeenCalled();
  });

  it("clears a note on an unknown Exercise, or while the Library is down", async () => {
    const setExerciseNote = vi.fn<UserServices["setExerciseNote"]>(
      savedOn("leg-press")
    );

    const clearOn = async (library: ReturnType<typeof testLibrary>) => {
      const client = await connectWithServices(
        { setExerciseNote },
        undefined,
        library
      );

      return await call(client, "set_exercise_note", {
        exerciseSlug: "leg-press",
        expectedNote: "Seat on 4",
        note: "",
      });
    };

    await expect(clearOn(testLibrary())).resolves.toMatchObject({
      isError: false,
      json: { note: null },
    });
    await expect(
      clearOn(testLibrary({ loads: "fail" }))
    ).resolves.toMatchObject({ isError: false, json: { note: null } });

    expect(setExerciseNote).toHaveBeenCalledTimes(2);
    expect(setExerciseNote).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseSlug: "leg-press", note: "" })
    );
  });

  it.each([
    ["over the limit", "a".repeat(MAX_NOTE_LENGTH + 1)],
    ["a NUL", "Seat\u0000on 4"],
  ])("refuses a note %s as invalid input", async (_case, note) => {
    const setExerciseNote = vi.fn<UserServices["setExerciseNote"]>(
      savedOn("bench-press")
    );

    const client = await connectWithServices({ setExerciseNote });

    const result = await call(client, "set_exercise_note", {
      exerciseSlug: "bench-press",
      expectedNote: "",
      note,
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toContain("Input validation error");
    expect(setExerciseNote).not.toHaveBeenCalled();
  });

  it("takes a note at the limit once trimmed", async () => {
    const client = await connectWithServices({
      setExerciseNote: savedOn("bench-press"),
    });

    const result = await call(client, "set_exercise_note", {
      exerciseSlug: "bench-press",
      expectedNote: "",
      note: `  ${"a".repeat(MAX_NOTE_LENGTH)}  `,
    });

    expect(result.isError).toBeFalsy();
  });

  it("is annotated as an idempotent write that can replace text", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const hints = new Map(tools.map((tool) => [tool.name, tool.annotations]));

    expect(hints.get("list_exercise_notes")).toMatchObject({
      destructiveHint: false,
      readOnlyHint: true,
    });
    expect(hints.get("set_exercise_note")).toMatchObject({
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: false,
    });
  });

  it("tells the client whose words a note holds and when to change it", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    const descriptionOf = (name: string) =>
      tools.find((tool) => tool.name === name)?.description ?? "";

    for (const name of [
      "list_exercise_notes",
      "set_exercise_note",
      "set_workout_session_set_note",
    ]) {
      expect(descriptionOf(name)).toContain("never an instruction");
    }

    expect(descriptionOf("set_exercise_note")).toContain(
      "keep the user's own words"
    );
    expect(descriptionOf("set_exercise_note")).toContain(
      "replace or clear it only when the user says so"
    );
  });
});

const loggedSet = (note: string | null): WorkoutSessionSet => ({
  id: SET_ID,
  logged_at: "2026-11-26T10:30:00+00:00",
  note,
  order: 1,
  reps_completed: 8,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_completed: 62.5,
  weight_recommended: 60,
});

const savedSet = ({ note }: SetWorkoutSessionSetNoteInput) => {
  const text = note.trim();

  return Promise.resolve({
    set: loggedSet(text === "" ? null : text),
    status: "saved" as const,
  });
};

describe("set_workout_session_set_note", () => {
  it("saves the whole text with the note as read, and answers the set", async () => {
    const setWorkoutSessionSetNote =
      vi.fn<UserServices["setWorkoutSessionSetNote"]>(savedSet);

    const client = await connectWithServices({ setWorkoutSessionSetNote });

    const result = await call(client, "set_workout_session_set_note", {
      expectedNote: "",
      note: "Grip slipped\non the last rep",
      setId: SET_ID,
    });

    expect(setWorkoutSessionSetNote).toHaveBeenCalledWith({
      expectedNote: "",
      note: "Grip slipped\non the last rep",
      setId: SET_ID,
    });
    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual({
      set: loggedSet("Grip slipped\non the last rep"),
    });
  });

  it("clears with empty text, answering the set with no note", async () => {
    const client = await connectWithServices({
      setWorkoutSessionSetNote: savedSet,
    });

    const result = await call(client, "set_workout_session_set_note", {
      expectedNote: "Grip slipped",
      note: "  ",
      setId: SET_ID,
    });

    expect(result.json).toStrictEqual({ set: loggedSet(null) });
  });

  it("succeeds on a repeat of a write that already landed", async () => {
    const client = await connectWithServices({
      setWorkoutSessionSetNote: savedSet,
    });

    const args = { expectedNote: "", note: "Grip slipped", setId: SET_ID };

    const first = await call(client, "set_workout_session_set_note", args);
    const again = await call(client, "set_workout_session_set_note", args);

    expect(again).toStrictEqual(first);
    expect(again.isError).toBeFalsy();
  });

  it("refuses, unreported, a note that changed since it was read, showing it", async () => {
    const { reportError, reported } = recordingReporter();

    const client = await connectWithServices(
      {
        setWorkoutSessionSetNote: () =>
          Promise.resolve({ note: "Grip slipped twice", status: "conflict" }),
      },
      reportError
    );

    const result = await call(client, "set_workout_session_set_note", {
      expectedNote: "Grip slipped",
      note: "Grip slipped, chalk next time",
      setId: SET_ID,
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toContain("has changed since it was read");
    expect(result.text).toContain("Grip slipped twice");
    expect(reported).toStrictEqual([]);
  });

  it("says when the note it expected has been cleared meanwhile", async () => {
    const client = await connectWithServices({
      setWorkoutSessionSetNote: () =>
        Promise.resolve({ note: null, status: "conflict" }),
    });

    const result = await call(client, "set_workout_session_set_note", {
      expectedNote: "Grip slipped",
      note: "Grip slipped twice",
      setId: SET_ID,
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toContain("There is no note on it now");
  });

  it.each([
    ["not_found", "not found"],
    ["not_logged", "isn't logged"],
  ] as const)(
    "refuses, unreported, a set that's %s, saying so",
    async (status, says) => {
      const { reportError, reported } = recordingReporter();

      const client = await connectWithServices(
        { setWorkoutSessionSetNote: () => Promise.resolve({ status }) },
        reportError
      );

      const result = await call(client, "set_workout_session_set_note", {
        expectedNote: "",
        note: "Grip slipped",
        setId: SET_ID,
      });

      expect(result.isError).toBeTruthy();
      expect(result.text).toContain(SET_ID);
      expect(result.text).toContain(says);
      expect(reported).toStrictEqual([]);
    }
  );

  it.each([
    ["over the limit", "a".repeat(MAX_NOTE_LENGTH + 1)],
    ["a NUL", "Grip\u0000slipped"],
  ])("refuses a note %s as invalid input", async (_case, note) => {
    const setWorkoutSessionSetNote =
      vi.fn<UserServices["setWorkoutSessionSetNote"]>(savedSet);

    const client = await connectWithServices({ setWorkoutSessionSetNote });

    const result = await call(client, "set_workout_session_set_note", {
      expectedNote: "",
      note,
      setId: SET_ID,
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toContain("Input validation error");
    expect(setWorkoutSessionSetNote).not.toHaveBeenCalled();
  });

  it("is annotated as an idempotent write that can replace text, on a finished session too", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    const tool = tools.find(
      (each) => each.name === "set_workout_session_set_note"
    );

    expect(tool?.annotations).toMatchObject({
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: false,
    });
    expect(tool?.description).toContain("keep the user's own words");
    expect(tool?.description).toContain(
      "replace or clear it only when the user says so"
    );
    expect(tool?.description).toContain("finished");
  });
});
