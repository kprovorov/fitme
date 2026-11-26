import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { exerciseNotes, withService } from "@fitme/db";
import {
  deleteTestUsers,
  withUserTablesLocked,
} from "@fitme/services/delete-test-users";
import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/create-app.js";
import { createServicesFromEnv } from "../src/services.js";
import {
  clerk,
  libraryExercise,
  signedInAs,
  switchableLibraryIndex,
} from "../src/test/harness.js";

/**
 * GET and PUT /v1/exercise-notes with the real services facade, through
 * `asUser` on the local stack's pooler, as made-up Clerk-style User ids.
 */
const reported: unknown[] = [];

const report = (error: unknown) => {
  reported.push(error);

  return Promise.resolve();
};

const library = switchableLibraryIndex(
  ["barbell-back-squat", "leg-press"].map((slug) => libraryExercise(slug)),
  { reportError: report }
);

const app = createApp({
  clerkJwtKey: clerk.jwtKey,
  createServices: createServicesFromEnv,
  exerciseLibrary: library.exerciseLibrary,
  identifyUser: () => {},
  libraryIndex: library.index,
  reportError: report,
});

/** A made-up id in Clerk's `user_…` format, unique per run. */
const testUserId = (label: string) =>
  `user_${label}${randomBytes(16).toString("hex")}`;

const owner = testUserId("noteOwner");
const intruder = testUserId("noteIntruder");
const racer = testUserId("noteRacer");

const put = (userId: string, slug: string, note: string) =>
  app.request(`/v1/exercise-notes/${slug}`, {
    body: JSON.stringify({ note }),
    headers: { ...signedInAs(userId), "content-type": "application/json" },
    method: "PUT",
  });

const list = async (userId: string) => {
  const response = await app.request("/v1/exercise-notes", {
    headers: signedInAs(userId),
  });

  expect(response.status).toBe(200);

  return (await response.json()) as {
    data: { exercise_slug: string; note: string; updated_at: string }[];
  };
};

/** The rows the database holds for `userId`. */
const rowsOf = (userId: string) =>
  withService((tx) =>
    tx
      .select({ note: exerciseNotes.note, slug: exerciseNotes.exerciseSlug })
      .from(exerciseNotes)
      .where(eq(exerciseNotes.userId, userId))
      .orderBy(exerciseNotes.exerciseSlug)
  );

describe("the Exercise notes routes against the local stack", () => {
  afterEach(() => {
    library.reset();
  });

  afterAll(async () => {
    await deleteTestUsers([owner, intruder, racer]);
  });

  it("saves and lists a note, a repeat answering the same", async () => {
    const saved = await put(owner, "leg-press", "  Seat on hole 4\nFeet high ");

    expect(saved.status).toBe(200);
    const { data } = await saved.json();
    expect(data).toMatchObject({
      exercise_slug: "leg-press",
      note: "Seat on hole 4\nFeet high",
    });

    const repeat = await put(owner, "leg-press", "Seat on hole 4\nFeet high");
    await expect(repeat.json()).resolves.toStrictEqual({ data });

    await expect(list(owner)).resolves.toStrictEqual({ data: [data] });
  });

  it("clears a note with blank text, deleting its row", async () => {
    await put(owner, "leg-press", "Seat on hole 4");

    const cleared = await put(owner, "leg-press", "   ");

    await expect(cleared.json()).resolves.toStrictEqual({
      data: { exercise_slug: "leg-press", note: null, updated_at: null },
    });
    await expect(rowsOf(owner)).resolves.toStrictEqual([]);
    await expect(list(owner)).resolves.toStrictEqual({ data: [] });
  });

  it("refuses an unknown Exercise and writes nothing, but clears a note on one", async () => {
    // A note on an Exercise that has since left the Library
    await withService((tx) =>
      tx
        .insert(exerciseNotes)
        .values({ exerciseSlug: "retired-press", note: "Old", userId: owner })
    );

    const refused = await put(owner, "retired-press", "New");

    expect(refused.status).toBe(400);
    const refusal = await refused.json();
    expect(refusal.error.code).toBe("unknown_exercises");
    await expect(rowsOf(owner)).resolves.toStrictEqual([
      { note: "Old", slug: "retired-press" },
    ]);

    const cleared = await put(owner, "retired-press", "");

    expect(cleared.status).toBe(200);
    await expect(rowsOf(owner)).resolves.toStrictEqual([]);
  });

  it("writes nothing while the Library can't load, and still clears", async () => {
    await put(owner, "barbell-back-squat", "Bar low");
    const outage = library.goCold();
    reported.length = 0;

    const refused = await put(owner, "barbell-back-squat", "Bar high");

    expect(refused.status).toBe(503);
    expect(reported).toStrictEqual([outage]);
    await expect(rowsOf(owner)).resolves.toStrictEqual([
      { note: "Bar low", slug: "barbell-back-squat" },
    ]);

    const cleared = await put(owner, "barbell-back-squat", "");

    expect(cleared.status).toBe(200);
    await expect(rowsOf(owner)).resolves.toStrictEqual([]);
  });

  it("never answers or changes another User's notes", async () => {
    await put(owner, "leg-press", "Mine");
    await put(intruder, "leg-press", "Theirs");
    await put(intruder, "barbell-back-squat", "");

    await expect(list(intruder)).resolves.toMatchObject({
      data: [{ exercise_slug: "leg-press", note: "Theirs" }],
    });
    await expect(rowsOf(owner)).resolves.toStrictEqual([
      { note: "Mine", slug: "leg-press" },
    ]);

    await put(intruder, "leg-press", "");

    await expect(rowsOf(owner)).resolves.toStrictEqual([
      { note: "Mine", slug: "leg-press" },
    ]);
  });

  it("queues behind an account deletion's table locks rather than deadlocking", async () => {
    let started: Promise<Response> | undefined;

    await withUserTablesLocked(async () => {
      started = Promise.resolve(put(racer, "leg-press", "Seat on hole 4"));

      const deadline = Date.now() + 5000;

      // The request waits on exercise_notes, which the deletion holds.
      const waited = async (): Promise<void> => {
        const { rows } = await withService((tx) =>
          tx.execute(sql`select 1 from pg_locks where not granted limit 1`)
        );

        if (rows.length > 0) {
          return;
        }

        if (Date.now() >= deadline) {
          throw new Error("The request never waited on a lock");
        }

        await delay(50);
        await waited();
      };

      await waited();
    });

    if (!started) {
      throw new Error("The request was never sent");
    }

    const response = await started;
    expect(response.status).toBe(200);
  });
});
