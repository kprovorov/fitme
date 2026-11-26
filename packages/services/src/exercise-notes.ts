import { cleanNote } from "@fitme/core/notes";
import type { NoteRefusal } from "@fitme/core/notes";
import { exerciseNotes } from "@fitme/db";
import type { Transaction } from "@fitme/db";
import { and, asc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { jsonTimestamp } from "./json-timestamp";

/**
 * A User's Exercise notes (`GLOSSARY.md`, Note): one per User and Exercise
 * slug, the same in every Plan and Workout. Each function runs in `tx` from
 * `asUser` and filters on the User id as well as RLS, so another User's
 * notes are never read, changed or cleared. The slug is stored as given
 * (ADR 0010: the caller checks it against the Library).
 */

/** An Exercise note as the services answer it. */
export interface ExerciseNote {
  exercise_slug: string;
  note: string;
  /** When the note was last changed, as `to_json` renders it. */
  updated_at: string;
}

/**
 * What setting a note answers:
 *
 * - `saved`: the note as it now is (`null` once cleared), also when it was
 *   already the new text, so a repeat is harmless;
 * - `conflict`: the note differs from the expected one, so nothing was
 *   written; the note as it is now (`null` for none);
 * - `invalid`: the text can't be a note (`cleanNote`'s refusal), so nothing
 *   reached the database.
 */
export type SetExerciseNoteResult =
  | { status: "saved"; note: ExerciseNote | null }
  | { status: "conflict"; note: ExerciseNote | null }
  | { status: "invalid"; reason: NoteRefusal };

export interface SetExerciseNoteInput {
  exerciseSlug: string;
  /** The note's new text, cleaned with `cleanNote`: blank clears it. */
  note: string;
  /**
   * The note the caller last read (`null` for none; blank text counts as
   * none). Given, the write lands only while the note is still that, or is
   * already the new text. Left out, the last save wins.
   */
  expectedNote?: string | null;
}

/** Rounds of reading and writing before a racing writer counts as a bug. */
const MAX_ATTEMPTS = 3;

const columns = {
  exercise_slug: exerciseNotes.exerciseSlug,
  note: exerciseNotes.note,
  // SAFETY: updated_at is NOT NULL, so its rendering is never null
  updated_at: jsonTimestamp(exerciseNotes.updatedAt) as SQL<string>,
};

const ofExercise = (userId: string, exerciseSlug: string) =>
  and(
    eq(exerciseNotes.userId, userId),
    eq(exerciseNotes.exerciseSlug, exerciseSlug)
  );

/** Every Exercise note of the User, by Exercise slug. */
export const listExerciseNotes = async (
  tx: Transaction,
  userId: string
): Promise<ExerciseNote[]> =>
  await tx
    .select(columns)
    .from(exerciseNotes)
    .where(eq(exerciseNotes.userId, userId))
    .orderBy(asc(exerciseNotes.exerciseSlug));

/** The expected note as the stored text compares to it. */
const expectedText = (expected: string | null): string | null => {
  const text = expected?.trim() ?? "";

  return text === "" ? null : text;
};

/**
 * Sets the User's note on one Exercise to `note`, cleaned (`cleanNote`):
 * blank text clears it, deleting its row; text `cleanNote` refuses is
 * `invalid` and never reaches the database.
 *
 * It takes ROW EXCLUSIVE on `exercise_notes` first (its place in
 * `deleteUserData`'s order, the last table there), then row-locks the note,
 * so a write racing an account deletion queues behind it and is then refused
 * under the retired id, never leaving a row behind. The expected note is
 * compared under that row lock. A first write that finds no row inserts with
 * `ON CONFLICT DO NOTHING`; when a concurrent first write committed the row
 * meanwhile, it reads that row and compares again, so two first writes end
 * with one row and no error, and with the same expected note only one wins.
 *
 * A caller writing other User tables in the same transaction calls it last:
 * `exercise_notes` is last in `deleteUserData`'s order, so taking another of
 * those tables after it could deadlock with an account deletion. A write that
 * queued behind an account deletion of the same User is refused by RLS under
 * the retired id (Postgres 42501, thrown), the account being gone.
 */
export const setExerciseNote = async (
  tx: Transaction,
  userId: string,
  { exerciseSlug, note, expectedNote }: SetExerciseNoteInput
): Promise<SetExerciseNoteResult> => {
  const cleaned = cleanNote(note);

  if (!cleaned.ok) {
    return { reason: cleaned.reason, status: "invalid" };
  }

  const text = cleaned.note;

  const expected =
    expectedNote === undefined ? undefined : expectedText(expectedNote);

  await tx.execute(sql`lock table ${exerciseNotes} in row exclusive mode`);

  const attempt = async (round: number): Promise<SetExerciseNoteResult> => {
    const [current] = await tx
      .select(columns)
      .from(exerciseNotes)
      .where(ofExercise(userId, exerciseSlug))
      .for("update");

    const present = current?.note ?? null;

    if (present === text) {
      return { note: current ?? null, status: "saved" };
    }

    if (expected !== undefined && present !== expected) {
      return { note: current ?? null, status: "conflict" };
    }

    if (text === null) {
      await tx.delete(exerciseNotes).where(ofExercise(userId, exerciseSlug));

      return { note: null, status: "saved" };
    }

    if (current !== undefined) {
      const [updated] = await tx
        .update(exerciseNotes)
        .set({ note: text, updatedAt: sql`now()` })
        .where(ofExercise(userId, exerciseSlug))
        .returning(columns);

      return { note: updated, status: "saved" };
    }

    const [inserted] = await tx
      .insert(exerciseNotes)
      .values({ exerciseSlug, note: text, userId })
      .onConflictDoNothing()
      .returning(columns);

    if (inserted !== undefined) {
      return { note: inserted, status: "saved" };
    }

    // A concurrent first write committed the row since the read above
    if (round === MAX_ATTEMPTS) {
      throw new Error("The Exercise note kept changing while being set");
    }

    return await attempt(round + 1);
  };

  return await attempt(1);
};
