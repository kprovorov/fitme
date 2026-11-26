import { MAX_NOTE_LENGTH } from "./limits";

/** Why a note's text can't be saved. */
export type NoteRefusal = "too_long" | "nul";

export type CleanedNote =
  | { ok: true; note: string | null }
  | { ok: false; reason: NoteRefusal };

/**
 * A note's length as Postgres's `char_length` counts it in a UTF-8 database:
 * one per Unicode code point. A JavaScript string's `length` counts UTF-16
 * code units instead, so an emoji outside the Basic Multilingual Plane (💪)
 * would count twice there and once in Postgres.
 */
export const noteLength = (text: string): number =>
  // oxlint-disable-next-line typescript/no-misused-spread -- code points are exactly what Postgres counts
  [...text].length;

/**
 * The one rule for a Note's text (an Exercise's or a logged set's), shared by
 * the services, the Public API, MCP, Arnold and the app:
 *
 * - trimmed at both ends (JavaScript's `trim`), line breaks inside kept;
 * - empty or whitespace-only text is no note (`note: null`), which clears it;
 * - text holding a NUL character is refused (`nul`): Postgres `text` can't
 *   store one;
 * - the trimmed text may be at most `MAX_NOTE_LENGTH` characters, counted as
 *   Postgres counts them (`noteLength`: code points, not UTF-16 units), so a
 *   note at the limit passes here and in the database's check alike; longer is
 *   refused (`too_long`), never shortened.
 */
export const cleanNote = (text: string): CleanedNote => {
  if (text.includes("\u0000")) {
    return { ok: false, reason: "nul" };
  }

  const note = text.trim();

  if (note === "") {
    return { ok: true, note: null };
  }

  if (noteLength(note) > MAX_NOTE_LENGTH) {
    return { ok: false, reason: "too_long" };
  }

  return { ok: true, note };
};
