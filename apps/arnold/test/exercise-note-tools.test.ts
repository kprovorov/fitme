import type * as Db from "@fitme/db";
import type * as Observability from "@fitme/observability/node";
import type * as NoteServices from "@fitme/services/exercise-notes";
import type {
  ExerciseNote,
  SetExerciseNoteInput,
  SetExerciseNoteResult,
} from "@fitme/services/exercise-notes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as LibraryModule from "../agent/lib/library";
import { LIBRARY_OUTAGE, testLibrary } from "./library";
import {
  contextFor,
  inputSchemaOf,
  userIdFields,
  withClientContext,
} from "./tool-context";

const tx = { fake: "transaction" };

const db = vi.hoisted(() => ({
  asUser:
    vi.fn<
      (
        userId: string,
        run: (transaction: typeof tx) => Promise<unknown>
      ) => Promise<unknown>
    >(),
}));

const notes = vi.hoisted(() => ({
  listExerciseNotes:
    vi.fn<
      (transaction: typeof tx, userId: string) => Promise<ExerciseNote[]>
    >(),
  setExerciseNote:
    vi.fn<
      (
        transaction: typeof tx,
        userId: string,
        input: SetExerciseNoteInput
      ) => Promise<SetExerciseNoteResult>
    >(),
}));

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Db | typeof db>(import("@fitme/db"), () => db);

vi.mock<typeof NoteServices | typeof notes>(
  import("@fitme/services/exercise-notes"),
  () => notes
);

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

vi.mock<typeof LibraryModule>(import("../agent/lib/library"), async () => {
  const { testLibrary: library } = await import("./library");

  return { getLibrary: () => library.get() };
});

const { default: listExerciseNotes } =
  await import("../agent/tools/list_exercise_notes");

const { default: setExerciseNote } =
  await import("../agent/tools/set_exercise_note");

const alice = contextFor("user_alice");
const SEAT = "Seat on 4";
const UPDATED_AT = "2026-11-26T10:00:00+00:00";

const stored = (exercise_slug: string, note: string): ExerciseNote => ({
  exercise_slug,
  note,
  updated_at: UPDATED_AT,
});

const resetFakes = () => {
  testLibrary.reset();
  db.asUser.mockImplementation(async (_userId, run) => await run(tx));
  notes.listExerciseNotes.mockResolvedValue([]);
  notes.setExerciseNote.mockImplementation(
    async (_tx, _userId, input) =>
      await Promise.resolve({
        note:
          input.note.trim() === ""
            ? null
            : stored(input.exerciseSlug, input.note.trim()),
        status: "saved" as const,
      })
  );
  observability.reportError.mockResolvedValue(undefined);
};

describe("list_exercise_notes", () => {
  beforeEach(resetFakes);

  it("lists the owner's notes, each named in the App language", async () => {
    notes.listExerciseNotes.mockResolvedValue([
      stored("back-squat", "Feet wide"),
      stored("plank", SEAT),
    ]);

    await expect(
      listExerciseNotes.execute(
        {},
        withClientContext(contextFor("user_alice", "user_mallory"), {
          language: "uk",
        })
      )
    ).resolves.toStrictEqual({
      notes: [
        {
          exercise_slug: "back-squat",
          name: "Присідання зі штангою",
          note: "Feet wide",
          updated_at: UPDATED_AT,
        },
        // No Ukrainian translation: named in English
        {
          exercise_slug: "plank",
          name: "Plank",
          note: SEAT,
          updated_at: UPDATED_AT,
        },
      ],
    });
    expect(db.asUser).toHaveBeenCalledExactlyOnceWith(
      "user_alice",
      expect.any(Function)
    );
    expect(notes.listExerciseNotes).toHaveBeenCalledExactlyOnceWith(
      tx,
      "user_alice"
    );
  });

  it("names a note's Exercise from its slug when the Library doesn't know it or can't load", async () => {
    notes.listExerciseNotes.mockResolvedValue([
      stored("cable-fly", "Light"),
      stored("plank", SEAT),
    ]);

    await expect(listExerciseNotes.execute({}, alice)).resolves.toStrictEqual({
      notes: [
        expect.objectContaining({ name: "Cable fly" }),
        expect.objectContaining({ name: "Plank" }),
      ],
    });

    testLibrary.reset({ loads: "fail" });

    await expect(listExerciseNotes.execute({}, alice)).resolves.toStrictEqual({
      notes: [
        expect.objectContaining({ name: "Cable fly", note: "Light" }),
        expect.objectContaining({ name: "Plank", note: SEAT }),
      ],
    });
  });

  it("answers no notes without asking the Library", async () => {
    testLibrary.reset({ loads: "fail" });

    await expect(listExerciseNotes.execute({}, alice)).resolves.toStrictEqual({
      notes: [],
    });
    expect(observability.reportError).not.toHaveBeenCalled();
  });

  it("refuses to run without a Clerk User owning the Conversation", async () => {
    await expect(
      listExerciseNotes.execute({}, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("takes no input, so the model can't name another User", () => {
    expect(inputSchemaOf(listExerciseNotes).parse(userIdFields)).toStrictEqual(
      {}
    );
  });
});

describe("set_exercise_note", () => {
  beforeEach(resetFakes);

  const input = {
    current_note: "",
    exercise_slug: "back-squat",
    note: "  Seat on 4  ",
  };

  it("writes the whole note as the owner, with the note it read as the expected one", async () => {
    await expect(
      setExerciseNote.execute(input, contextFor("user_alice", "user_mallory"))
    ).resolves.toStrictEqual({
      exercise_slug: "back-squat",
      note: SEAT,
      success: true,
    });
    expect(db.asUser).toHaveBeenCalledExactlyOnceWith(
      "user_alice",
      expect.any(Function)
    );
    expect(notes.setExerciseNote).toHaveBeenCalledExactlyOnceWith(
      tx,
      "user_alice",
      { exerciseSlug: "back-squat", expectedNote: "", note: input.note }
    );
  });

  it("keeps a note on an old slug the Library still knows under that slug, as the list shows it", async () => {
    await setExerciseNote.execute(
      { ...input, exercise_slug: "barbell-bench-press" },
      alice
    );

    expect(notes.setExerciseNote).toHaveBeenCalledWith(tx, "user_alice", {
      exerciseSlug: "barbell-bench-press",
      expectedNote: "",
      note: input.note,
    });
  });

  it("answers the present note and writes nothing when it changed since Arnold read it", async () => {
    notes.setExerciseNote.mockResolvedValue({
      note: stored("back-squat", "Feet wide"),
      status: "conflict",
    });

    await expect(
      setExerciseNote.execute(
        {
          ...input,
          current_note: "Feet narrow",
          note: "Feet narrow\nSeat on 4",
        },
        alice
      )
    ).resolves.toStrictEqual({
      current_note: "Feet wide",
      error:
        "The note changed since you read it; nothing was saved. current_note is the note as it is now: show it to the user and ask how to change it.",
    });
  });

  it("answers an empty present note when the one Arnold read was cleared meanwhile", async () => {
    notes.setExerciseNote.mockResolvedValue({ note: null, status: "conflict" });

    await expect(
      setExerciseNote.execute({ ...input, current_note: "Feet wide" }, alice)
    ).resolves.toMatchObject({ current_note: "" });
  });

  it("succeeds when a re-run step repeats a write that already landed", async () => {
    // The note is already the new text, so the services answer saved
    notes.setExerciseNote.mockResolvedValue({
      note: stored("back-squat", SEAT),
      status: "saved",
    });

    await expect(
      setExerciseNote.execute({ ...input, current_note: "" }, alice)
    ).resolves.toStrictEqual({
      exercise_slug: "back-squat",
      note: SEAT,
      success: true,
    });
  });

  it("clears the note with empty text, even for an Exercise the Library doesn't know", async () => {
    testLibrary.reset({ loads: "fail" });

    await expect(
      setExerciseNote.execute(
        { current_note: "Light", exercise_slug: "cable-fly", note: "  " },
        alice
      )
    ).resolves.toStrictEqual({
      exercise_slug: "cable-fly",
      note: "",
      success: true,
    });
    expect(notes.setExerciseNote).toHaveBeenCalledWith(tx, "user_alice", {
      exerciseSlug: "cable-fly",
      expectedNote: "Light",
      note: "  ",
    });
    expect(observability.reportError).not.toHaveBeenCalled();
  });

  it("checks the slug in the Library before the transaction, writing nothing for an unknown one", async () => {
    await expect(
      setExerciseNote.execute({ ...input, exercise_slug: "cable-fly" }, alice)
    ).resolves.toStrictEqual({
      error:
        "Unknown exercise_slug(s): cable-fly. Use search_exercises to find a valid exercise_slug; nothing was saved.",
    });

    await expect(
      setExerciseNote.execute(
        { ...input, exercise_slug: "d0000000-0000-4000-8000-000000000001" },
        alice
      )
    ).resolves.toMatchObject({
      error: expect.stringContaining("not by id"),
    });
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("asks to retry and writes nothing when the Library can't load", async () => {
    testLibrary.reset({ loads: "fail" });

    await expect(setExerciseNote.execute(input, alice)).resolves.toStrictEqual({
      error:
        "The exercise library is unavailable right now, so nothing was saved. Try again in a moment.",
    });
    expect(db.asUser).not.toHaveBeenCalled();
    expect(observability.reportError).toHaveBeenCalledWith(LIBRARY_OUTAGE, {
      exercise_library: "library",
    });
  });

  it("refuses a note over 500 characters, and asks the model not to cut it itself", async () => {
    const long = "a".repeat(501);

    await expect(
      setExerciseNote.execute({ ...input, note: long }, alice)
    ).resolves.toStrictEqual({
      error:
        "The note is over 500 characters; nothing was saved. Don't shorten it yourself: tell the user it doesn't fit and ask what to cut.",
    });
    expect(db.asUser).not.toHaveBeenCalled();

    // 500 emoji are 1000 UTF-16 units but 500 characters, as Postgres counts
    await expect(
      setExerciseNote.execute({ ...input, note: "💪".repeat(500) }, alice)
    ).resolves.toMatchObject({ success: true });
  });

  it("refuses a note holding a NUL character", async () => {
    await expect(
      setExerciseNote.execute({ ...input, note: "Seat\u0000on 4" }, alice)
    ).resolves.toStrictEqual({
      error:
        "The note holds a NUL character, which a note can't contain; nothing was saved.",
    });
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("refuses to run without a Clerk User owning the Conversation", async () => {
    await expect(
      setExerciseNote.execute(input, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("takes the slug, the note and the note Arnold read, and no User", () => {
    const schema = inputSchemaOf(setExerciseNote);

    expect(schema.parse({ ...input, ...userIdFields })).toStrictEqual({
      ...input,
      exercise_slug: "back-squat",
    });
    expect(
      schema.safeParse({ exercise_slug: "back-squat", note: SEAT }).success
    ).toBeFalsy();
  });

  it("puts no note text in a report", async () => {
    notes.setExerciseNote.mockResolvedValue({
      note: stored("back-squat", "Feet wide"),
      status: "conflict",
    });

    await setExerciseNote.execute(input, alice);
    await setExerciseNote.execute({ ...input, note: "a".repeat(501) }, alice);

    expect(observability.reportError).not.toHaveBeenCalled();
  });
});
