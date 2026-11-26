import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { MAX_NOTE_LENGTH } from "@fitme/core/limits";
import { asUser, exerciseNotes, plans, withService } from "@fitme/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { deleteUserData } from "../src/delete-user-data";
import { listExerciseNotes, setExerciseNote } from "../src/exercise-notes";
import type { SetExerciseNoteInput } from "../src/exercise-notes";
import { deletePlan } from "../src/plans";
import { deleteTestUsers, withUserTablesLocked } from "./delete-test-users";

/**
 * listExerciseNotes and setExerciseNote through asUser, against a local
 * Supabase stack via the Supavisor pooler as the fitme login. Made-up
 * Clerk-style User ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcNotesOwner${runId}`;
const other = `user_svcNotesOther${runId}`;
const racer = `user_svcNotesRacer${runId}`;
const planOwner = `user_svcNotesPlan${runId}`;
const deleted = `user_svcNotesDeleted${runId}`;
const raced = `user_svcNotesRaced${runId}`;

/** Long enough for a transaction waiting on a lock to have queued there. */
const QUEUE_HEAD_START_MS = 200;

const set = async (userId: string, input: SetExerciseNoteInput) =>
  await asUser(userId, async (tx) => await setExerciseNote(tx, userId, input));

const list = async (userId: string) =>
  await asUser(userId, async (tx) => await listExerciseNotes(tx, userId));

/** The rows stored for the User, read past RLS. */
const rows = async (userId: string) =>
  await withService((tx) =>
    tx
      .select({
        exerciseSlug: exerciseNotes.exerciseSlug,
        note: exerciseNotes.note,
      })
      .from(exerciseNotes)
      .where(eq(exerciseNotes.userId, userId))
  );

let slugCount = 0;

/** A slug no other test uses. */
const newSlug = () => {
  slugCount += 1;

  return `test-press-${runId}-${slugCount}`;
};

describe("exercise notes", () => {
  afterAll(async () => {
    await deleteTestUsers([owner, other, racer, planOwner, deleted, raced]);
  });

  describe("listing, creating, changing and clearing", () => {
    it("creates a note and lists it", async () => {
      const slug = newSlug();

      const created = await set(owner, {
        exerciseSlug: slug,
        note: "  Seat on hole 4\nfeet high  ",
      });

      expect(created).toStrictEqual({
        note: {
          exercise_slug: slug,
          note: "Seat on hole 4\nfeet high",
          updated_at: expect.any(String),
        },
        status: "saved",
      });
      await expect(list(owner)).resolves.toContainEqual(
        created.status === "saved" ? created.note : undefined
      );
    });

    it("changes a note and clears it", async () => {
      const slug = newSlug();
      await set(owner, { exerciseSlug: slug, note: "Hole 4" });

      const changed = await set(owner, { exerciseSlug: slug, note: "Hole 5" });

      expect(changed).toMatchObject({
        note: { exercise_slug: slug, note: "Hole 5" },
        status: "saved",
      });
      await expect(rows(owner)).resolves.toContainEqual({
        exerciseSlug: slug,
        note: "Hole 5",
      });

      await expect(
        set(owner, { exerciseSlug: slug, note: " \n " })
      ).resolves.toStrictEqual({ note: null, status: "saved" });
      await expect(rows(owner)).resolves.not.toContainEqual(
        expect.objectContaining({ exerciseSlug: slug })
      );
    });

    it("lists every note of the User by slug, with when it last changed", async () => {
      const user = `user_svcNotesList${runId}`;

      try {
        await expect(list(user)).resolves.toStrictEqual([]);

        await set(user, { exerciseSlug: "b-squat", note: "Wide stance" });
        await set(user, { exerciseSlug: "a-bench", note: "Arch" });

        const notes = await list(user);

        expect(notes.map((note) => note.exercise_slug)).toStrictEqual([
          "a-bench",
          "b-squat",
        ]);
        expect(Date.parse(notes[0].updated_at)).toBeGreaterThan(0);
      } finally {
        await deleteTestUsers([user]);
      }
    });

    it("moves updated_at on a change", async () => {
      const slug = newSlug();
      const first = await set(owner, { exerciseSlug: slug, note: "One" });
      const second = await set(owner, { exerciseSlug: slug, note: "Two" });

      const updatedAt = (result: typeof first) =>
        Date.parse(
          result.status === "saved" ? (result.note?.updated_at ?? "") : ""
        );

      expect(updatedAt(second)).toBeGreaterThan(updatedAt(first));
    });

    it("is harmless to repeat a set or a clear", async () => {
      const slug = newSlug();
      const first = await set(owner, { exerciseSlug: slug, note: "Same" });
      const again = await set(owner, { exerciseSlug: slug, note: "Same " });

      // Nothing rewritten: the note and its time stay
      expect(again).toStrictEqual(first);

      await set(owner, { exerciseSlug: slug, note: "" });
      await expect(
        set(owner, { exerciseSlug: slug, note: "" })
      ).resolves.toStrictEqual({ note: null, status: "saved" });
      await expect(rows(owner)).resolves.not.toContainEqual(
        expect.objectContaining({ exerciseSlug: slug })
      );
    });

    it("stores the slug as given", async () => {
      const slug = `Not A Library Slug ${runId}`;

      await expect(
        set(owner, { exerciseSlug: slug, note: "Kept anyway" })
      ).resolves.toMatchObject({ note: { exercise_slug: slug } });
    });
  });

  describe("text the database can't take", () => {
    it("refuses text past the limit, writing nothing", async () => {
      const slug = newSlug();
      await set(owner, { exerciseSlug: slug, note: "Kept" });

      await expect(
        set(owner, {
          exerciseSlug: slug,
          note: "x".repeat(MAX_NOTE_LENGTH + 1),
        })
      ).resolves.toStrictEqual({ reason: "too_long", status: "invalid" });
      await expect(rows(owner)).resolves.toContainEqual({
        exerciseSlug: slug,
        note: "Kept",
      });
    });

    it("refuses a NUL, writing nothing", async () => {
      const slug = newSlug();

      await expect(
        set(owner, { exerciseSlug: slug, note: "a\u0000b" })
      ).resolves.toStrictEqual({ reason: "nul", status: "invalid" });
      await expect(rows(owner)).resolves.not.toContainEqual(
        expect.objectContaining({ exerciseSlug: slug })
      );
    });

    it("takes a note at the limit counted as Postgres counts it", async () => {
      const slug = newSlug();
      // Each emoji is two UTF-16 units but one character to Postgres
      const note = "💪".repeat(MAX_NOTE_LENGTH);

      await expect(
        set(owner, { exerciseSlug: slug, note })
      ).resolves.toMatchObject({ note: { note }, status: "saved" });
    });
  });

  describe("the expected note", () => {
    it("writes when the expected note matches", async () => {
      const slug = newSlug();

      await expect(
        set(owner, { exerciseSlug: slug, expectedNote: null, note: "First" })
      ).resolves.toMatchObject({ note: { note: "First" }, status: "saved" });
      await expect(
        set(owner, {
          exerciseSlug: slug,
          expectedNote: "First",
          note: "Second",
        })
      ).resolves.toMatchObject({ note: { note: "Second" }, status: "saved" });
      await expect(
        set(owner, { exerciseSlug: slug, expectedNote: "Second", note: "" })
      ).resolves.toStrictEqual({ note: null, status: "saved" });
    });

    it("counts blank expected text as no note", async () => {
      const slug = newSlug();

      await expect(
        set(owner, { exerciseSlug: slug, expectedNote: "", note: "Fresh" })
      ).resolves.toMatchObject({ status: "saved" });
    });

    it("writes nothing and answers the present note when it doesn't match", async () => {
      const slug = newSlug();
      const saved = await set(owner, { exerciseSlug: slug, note: "Present" });
      const present = saved.status === "saved" ? saved : { note: undefined };

      await expect(
        set(owner, { exerciseSlug: slug, expectedNote: "Stale", note: "Mine" })
      ).resolves.toStrictEqual({ note: present.note, status: "conflict" });
      await expect(
        set(owner, { exerciseSlug: slug, expectedNote: null, note: "Mine" })
      ).resolves.toStrictEqual({ note: present.note, status: "conflict" });
      await expect(
        set(owner, { exerciseSlug: slug, expectedNote: "Stale", note: "" })
      ).resolves.toStrictEqual({ note: present.note, status: "conflict" });
      await expect(rows(owner)).resolves.toContainEqual({
        exerciseSlug: slug,
        note: "Present",
      });
    });

    it("answers no note when one was expected and there's none", async () => {
      const slug = newSlug();

      await expect(
        set(owner, { exerciseSlug: slug, expectedNote: "Gone", note: "Mine" })
      ).resolves.toStrictEqual({ note: null, status: "conflict" });
      await expect(rows(owner)).resolves.not.toContainEqual(
        expect.objectContaining({ exerciseSlug: slug })
      );
    });

    it("is success to repeat a write that already landed", async () => {
      const slug = newSlug();
      await set(owner, { exerciseSlug: slug, note: "Before" });

      const landed = await set(owner, {
        exerciseSlug: slug,
        expectedNote: "Before",
        note: "After",
      });

      // A re-run step sends the same expected note again
      await expect(
        set(owner, {
          exerciseSlug: slug,
          expectedNote: "Before",
          note: "After",
        })
      ).resolves.toStrictEqual(landed);

      await set(owner, { exerciseSlug: slug, expectedNote: "After", note: "" });
      await expect(
        set(owner, { exerciseSlug: slug, expectedNote: "After", note: "" })
      ).resolves.toStrictEqual({ note: null, status: "saved" });
    });
  });

  describe("two first writes at once", () => {
    /**
     * Starts the first write and holds its transaction open after the insert,
     * runs the second while it does (so the second has also found no row and
     * queues on the insert), then lets the first commit.
     */
    const race = async (
      first: SetExerciseNoteInput,
      second: SetExerciseNoteInput
    ) => {
      let release: () => void = () => undefined;

      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      let inserted: () => void = () => undefined;

      const firstInserted = new Promise<void>((resolve) => {
        inserted = resolve;
      });

      const firstWrite = asUser(racer, async (tx) => {
        const result = await setExerciseNote(tx, racer, first);
        inserted();
        await held;

        return result;
      });

      await firstInserted;
      const secondWrite = set(racer, second);
      await setTimeout(QUEUE_HEAD_START_MS);
      release();

      return await Promise.all([firstWrite, secondWrite]);
    };

    it("end with one row and no error, the last save winning", async () => {
      const slug = newSlug();

      const [first, second] = await race(
        { exerciseSlug: slug, note: "From A" },
        { exerciseSlug: slug, note: "From B" }
      );

      expect(first.status).toBe("saved");
      expect(second).toMatchObject({
        note: { note: "From B" },
        status: "saved",
      });
      await expect(rows(racer)).resolves.toStrictEqual([
        { exerciseSlug: slug, note: "From B" },
      ]);
      await set(racer, { exerciseSlug: slug, note: "" });
    });

    it("with the same expected note, let exactly one win", async () => {
      const slug = newSlug();

      const [first, second] = await race(
        { exerciseSlug: slug, expectedNote: null, note: "From A" },
        { exerciseSlug: slug, expectedNote: null, note: "From B" }
      );

      expect(first).toMatchObject({
        note: { note: "From A" },
        status: "saved",
      });
      expect(second).toMatchObject({
        note: { note: "From A" },
        status: "conflict",
      });
      await expect(rows(racer)).resolves.toStrictEqual([
        { exerciseSlug: slug, note: "From A" },
      ]);
      await set(racer, { exerciseSlug: slug, note: "" });
    });
  });

  describe("another User's notes", () => {
    it("are never read", async () => {
      const slug = newSlug();
      await set(other, { exerciseSlug: slug, note: "Theirs" });

      await expect(
        asUser(owner, async (tx) => await listExerciseNotes(tx, other))
      ).resolves.toStrictEqual([]);
      await expect(list(owner)).resolves.not.toContainEqual(
        expect.objectContaining({ note: "Theirs" })
      );
    });

    it("are never changed or cleared", async () => {
      const slug = newSlug();
      await set(other, { exerciseSlug: slug, note: "Theirs" });
      // The caller's own note on the same Exercise is a separate one
      await set(owner, { exerciseSlug: slug, note: "Mine" });

      await expect(
        asUser(
          owner,
          async (tx) =>
            await setExerciseNote(tx, other, {
              exerciseSlug: slug,
              note: "Changed",
            })
        )
      ).rejects.toThrow('Failed query: insert into "exercise_notes"');
      await expect(
        asUser(
          owner,
          async (tx) =>
            await setExerciseNote(tx, other, { exerciseSlug: slug, note: "" })
        )
      ).resolves.toStrictEqual({ note: null, status: "saved" });

      await expect(rows(other)).resolves.toContainEqual({
        exerciseSlug: slug,
        note: "Theirs",
      });
      await expect(rows(owner)).resolves.toContainEqual({
        exerciseSlug: slug,
        note: "Mine",
      });
    });
  });

  describe("around the User's other data", () => {
    it("stay when a Plan is deleted", async () => {
      const slug = newSlug();

      const [plan] = await withService((tx) =>
        tx
          .insert(plans)
          .values({
            frequency: 3,
            goal: "general",
            place: "gym",
            userId: planOwner,
          })
          .returning({ id: plans.id })
      );

      await set(planOwner, { exerciseSlug: slug, note: "Learned" });

      await asUser(planOwner, async (tx) => {
        await deletePlan(tx, planOwner, plan.id);
      });

      await expect(rows(planOwner)).resolves.toStrictEqual([
        { exerciseSlug: slug, note: "Learned" },
      ]);
    });

    it("go with the account", async () => {
      await set(deleted, { exerciseSlug: newSlug(), note: "One" });
      await set(deleted, { exerciseSlug: newSlug(), note: "Two" });
      await set(other, { exerciseSlug: newSlug(), note: "Bystander" });

      await withUserTablesLocked(async (tx) => {
        await deleteUserData(tx, deleted);
      });

      await expect(rows(deleted)).resolves.toStrictEqual([]);
      await expect(rows(other)).resolves.toContainEqual(
        expect.objectContaining({ note: "Bystander" })
      );
    });

    it("a write racing an account deletion queues behind it and leaves no row", async () => {
      const slug = newSlug();
      await set(raced, { exerciseSlug: newSlug(), note: "Before" });

      let write: Promise<unknown> | undefined;

      await withUserTablesLocked(async (tx) => {
        await deleteUserData(tx, raced);
        write = set(raced, { exerciseSlug: slug, note: "During" }).catch(
          (error: unknown) => error
        );
        // Let the write queue on the deletion's locks before it commits
        await setTimeout(QUEUE_HEAD_START_MS);
      });

      // Refused under the retired id once the deletion committed
      await expect(write).resolves.toBeInstanceOf(Error);
      await expect(rows(raced)).resolves.toStrictEqual([]);
    });
  });
});
