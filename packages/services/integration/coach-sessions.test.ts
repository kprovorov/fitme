import { randomUUID } from "node:crypto";
import { asUser, coachSessions, withService } from "@fitme/db";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  getCoachSessionOwner,
  listCoachSessionIds,
  recordCoachSession,
} from "../src/coach-sessions";

/**
 * recordCoachSession and listCoachSessionIds through asUser, against a local
 * Supabase stack via the Supavisor pooler as the fitme login. Made-up
 * Clerk-style User ids and EVE-style session ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcCoachOwner${runId}`;
const other = `user_svcCoachOther${runId}`;
const ownerSession = `wrun_svcCoachOwner${runId}`;
const secondSession = `wrun_svcCoachSecond${runId}`;
const otherSession = `wrun_svcCoachOther${runId}`;

afterAll(async () => {
  await withService((tx) =>
    tx
      .delete(coachSessions)
      .where(inArray(coachSessions.userId, [owner, other]))
  );
});

describe("recordCoachSession", () => {
  it("records the session for the User, once however often it runs", async () => {
    await asUser(owner, (tx) => recordCoachSession(tx, owner, ownerSession));
    await asUser(owner, (tx) => recordCoachSession(tx, owner, ownerSession));
    await asUser(owner, (tx) => recordCoachSession(tx, owner, secondSession));

    expect(
      (await asUser(owner, (tx) => listCoachSessionIds(tx, owner))).sort()
    ).toEqual([ownerSession, secondSession].sort());
  });

  it("can't record a session for another User", async () => {
    await expect(
      asUser(owner, (tx) => recordCoachSession(tx, other, otherSession))
    ).rejects.toThrow();
  });

  it("never lists another User's sessions", async () => {
    await asUser(other, (tx) => recordCoachSession(tx, other, otherSession));

    expect(await asUser(other, (tx) => listCoachSessionIds(tx, other))).toEqual(
      [otherSession]
    );
    expect(await asUser(owner, (tx) => listCoachSessionIds(tx, other))).toEqual(
      []
    );
  });

  it("leaves another User's session alone when its id is recorded again", async () => {
    await asUser(owner, (tx) => recordCoachSession(tx, owner, otherSession));

    expect(await asUser(other, (tx) => listCoachSessionIds(tx, other))).toEqual(
      [otherSession]
    );
    expect(
      await asUser(owner, (tx) => listCoachSessionIds(tx, owner))
    ).not.toContain(otherSession);
  });
});

describe("getCoachSessionOwner", () => {
  it("names the User a session was recorded for", async () => {
    await asUser(owner, (tx) => recordCoachSession(tx, owner, ownerSession));

    expect(
      await withService((tx) => getCoachSessionOwner(tx, ownerSession))
    ).toBe(owner);
  });

  it("returns null for a session nobody recorded", async () => {
    expect(
      await withService((tx) =>
        getCoachSessionOwner(tx, `wrun_svcCoachUnknown${runId}`)
      )
    ).toBeNull();
  });
});
