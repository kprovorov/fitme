import type * as Db from "@fitme/db";
import type * as SessionServices from "@fitme/services/workout-sessions";
import type {
  SetWorkoutSessionSetNoteInput,
  SetWorkoutSessionSetNoteResult,
  WorkoutSessionSet,
} from "@fitme/services/workout-sessions";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextFor, inputSchemaOf, userIdFields } from "./tool-context";

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

const sessions = vi.hoisted(() => ({
  setWorkoutSessionSetNote:
    vi.fn<
      (
        transaction: typeof tx,
        userId: string,
        input: SetWorkoutSessionSetNoteInput
      ) => Promise<SetWorkoutSessionSetNoteResult>
    >(),
}));

vi.mock<typeof Db | typeof db>(import("@fitme/db"), () => db);

vi.mock<typeof SessionServices | typeof sessions>(
  import("@fitme/services/workout-sessions"),
  () => sessions
);

const { default: setSetNote } =
  await import("../agent/tools/set_workout_session_set_note");

const SET_ID = "d0000000-0000-4000-8000-000000000001";
const HEAVY = "Too heavy";
const alice = contextFor("user_alice");

const savedSet = (note: string | null): WorkoutSessionSet => ({
  id: SET_ID,
  logged_at: "2026-11-27T18:05:00+00:00",
  note,
  order: 2,
  reps_completed: 6,
  reps_recommended: 8,
  rest_recommended: 90,
  weight_completed: 80,
  weight_recommended: 80,
});

const input = { current_note: "", note: "  Too heavy  ", set_id: SET_ID };

describe("set_workout_session_set_note", () => {
  beforeEach(() => {
    db.asUser.mockImplementation(async (_userId, run) => await run(tx));
    sessions.setWorkoutSessionSetNote.mockImplementation(
      async (_tx, _userId, { note }) =>
        await Promise.resolve({
          set: savedSet(note.trim() === "" ? null : note.trim()),
          status: "saved" as const,
        })
    );
  });

  it("writes the whole note as the owner, never the turn's caller, with the note it read as the expected one", async () => {
    await expect(
      setSetNote.execute(input, contextFor("user_alice", "user_mallory"))
    ).resolves.toStrictEqual({ note: HEAVY, success: true });
    expect(db.asUser).toHaveBeenCalledExactlyOnceWith(
      "user_alice",
      expect.any(Function)
    );
    expect(sessions.setWorkoutSessionSetNote).toHaveBeenCalledExactlyOnceWith(
      tx,
      "user_alice",
      { expectedNote: "", note: input.note, setId: SET_ID }
    );
  });

  it("clears the note with empty text", async () => {
    await expect(
      setSetNote.execute({ ...input, current_note: HEAVY, note: " " }, alice)
    ).resolves.toStrictEqual({ note: "", success: true });
  });

  it("succeeds when a re-run step repeats a write that already landed", async () => {
    // The note is already the new text, so the service answers saved
    sessions.setWorkoutSessionSetNote.mockResolvedValue({
      set: savedSet(HEAVY),
      status: "saved",
    });

    await expect(setSetNote.execute(input, alice)).resolves.toStrictEqual({
      note: HEAVY,
      success: true,
    });
  });

  it("answers the present note and writes nothing when it changed since Arnold read it", async () => {
    sessions.setWorkoutSessionSetNote.mockResolvedValue({
      note: "Shoulder clicked",
      status: "conflict",
    });

    await expect(setSetNote.execute(input, alice)).resolves.toStrictEqual({
      current_note: "Shoulder clicked",
      error:
        "The set's note changed since you read it; nothing was saved. current_note is the note as it is now: show it to the user and ask how to change it.",
    });
  });

  it("answers an empty present note when the one Arnold read was cleared meanwhile", async () => {
    sessions.setWorkoutSessionSetNote.mockResolvedValue({
      note: null,
      status: "conflict",
    });

    await expect(
      setSetNote.execute({ ...input, current_note: HEAVY }, alice)
    ).resolves.toMatchObject({ current_note: "" });
  });

  it("tells him the set isn't logged yet, so he can say so", async () => {
    sessions.setWorkoutSessionSetNote.mockResolvedValue({
      status: "not_logged",
    });

    await expect(setSetNote.execute(input, alice)).resolves.toStrictEqual({
      error:
        "That set isn't logged yet, so it can't have a note; nothing was saved. Tell the user it isn't logged yet: they can log it on the workout screen, then ask again.",
    });
  });

  it("answers an error for a missing set", async () => {
    sessions.setWorkoutSessionSetNote.mockResolvedValue({
      status: "not_found",
    });

    await expect(setSetNote.execute(input, alice)).resolves.toStrictEqual({
      error:
        "Set not found: it doesn't exist or was removed; nothing was saved.",
    });
  });

  it("refuses a note over 500 characters without a transaction, and asks the model not to cut it itself", async () => {
    await expect(
      setSetNote.execute({ ...input, note: "a".repeat(501) }, alice)
    ).resolves.toStrictEqual({
      error:
        "The note is over 500 characters; nothing was saved. Don't shorten it yourself: tell the user it doesn't fit and ask what to cut.",
    });
    expect(db.asUser).not.toHaveBeenCalled();

    // 500 emoji are 1000 UTF-16 units but 500 characters, as Postgres counts
    await expect(
      setSetNote.execute({ ...input, note: "💪".repeat(500) }, alice)
    ).resolves.toMatchObject({ success: true });
  });

  it("refuses a note holding a NUL character", async () => {
    await expect(
      setSetNote.execute({ ...input, note: "Too\u0000heavy" }, alice)
    ).resolves.toStrictEqual({
      error:
        "The note holds a NUL character, which a note can't contain; nothing was saved.",
    });
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("refuses to run without a Clerk User owning the Conversation", async () => {
    await expect(setSetNote.execute(input, contextFor(null))).rejects.toThrow(
      "This Conversation has no signed-in owner"
    );
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("takes the set's id, the note and the note Arnold read, and no User or set values", () => {
    const schema = inputSchemaOf(setSetNote);

    expect(
      schema.parse({ ...input, ...userIdFields, reps_completed: 8 })
    ).toStrictEqual(input);
    expect(
      schema.safeParse({ note: HEAVY, set_id: SET_ID }).success
    ).toBeFalsy();
    expect(
      schema.safeParse({ ...input, set_id: "not-a-uuid" }).success
    ).toBeFalsy();
  });
});
