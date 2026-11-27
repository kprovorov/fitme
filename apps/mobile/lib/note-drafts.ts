import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import { cleanNote, noteLength } from "@fitme/core/notes";

/**
 * Why the last save of a note didn't land, as its editor says it: a 429's
 * wait, or the `notes.errors.<kind>` message.
 */
export type NoteSaveFailure =
  | { kind: "rateLimited"; seconds: number }
  | {
      kind:
        | "libraryUnavailable"
        | "save"
        | "setGone"
        | "setNotLogged"
        | "unknownExercise";
    };

/** The API's refusals of a note, by their code, as the editor names them. */
const REFUSALS = {
  exercise: new Map<string, NoteSaveFailure>([
    ["library_unavailable", { kind: "libraryUnavailable" }],
    ["unknown_exercises", { kind: "unknownExercise" }],
  ]),
  set: new Map<string, NoteSaveFailure>([
    ["not_found", { kind: "setGone" }],
    ["set_not_logged", { kind: "setNotLogged" }],
  ]),
};

/**
 * A failed save of a note on `target` as its editor shows it: a 429's wait,
 * the API's own refusals of that kind of note (an Exercise the Library
 * doesn't know or can't check; a set that's gone or not logged), anything
 * else the generic message.
 */
export const noteSaveFailureOf = (
  error: unknown,
  target: keyof typeof REFUSALS
): NoteSaveFailure => {
  const seconds = rateLimitedFor(error);

  if (seconds !== null) {
    return { kind: "rateLimited", seconds };
  }

  const code = error instanceof ApiError ? error.code : null;

  return (
    (code === null ? undefined : REFUSALS[target].get(code)) ?? {
      kind: "save",
    }
  );
};

/** How long a note's text is as saved: trimmed, in code points. */
export const savedNoteLength = (text: string): number =>
  noteLength(text.trim());

/**
 * What the User typed or pasted, as the field keeps it: without NUL
 * characters (Postgres can't store one, so the API refuses them), and cut
 * where the text that would be saved (trimmed) reaches the limit.
 */
export const withinNoteLimit = (typed: string): string => {
  const text = typed.replaceAll("\u0000", "");

  if (savedNoteLength(text) <= MAX_NOTE_LENGTH) {
    return text;
  }

  const leading = noteLength(text) - noteLength(text.trimStart());

  // oxlint-disable-next-line typescript/no-misused-spread -- code points are exactly what Postgres counts
  return [...text].slice(0, leading + MAX_NOTE_LENGTH).join("");
};

/** The text a draft would save: trimmed, `null` for none. */
export const savedNoteOf = (draft: string): string | null => {
  const cleaned = cleanNote(draft);

  return cleaned.ok ? cleaned.note : draft;
};
