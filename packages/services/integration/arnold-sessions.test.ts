import { randomUUID } from "node:crypto";
import { arnoldSessions, asUser, withService } from "@fitme/db";
import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  getArnoldSessionOwner,
  listArnoldSessionIds,
  recordArnoldSession,
} from "../src/arnold-sessions";
import { deleteUserData } from "../src/delete-user-data";

/**
 * recordArnoldSession and listArnoldSessionIds through asUser, against a local
 * Supabase stack via the Supavisor pooler as the fitme login. Made-up
 * Clerk-style User ids and EVE-style session ids, unique per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const owner = `user_svcArnoldOwner${runId}`;
const other = `user_svcArnoldOther${runId}`;
const ownerSession = `wrun_svcArnoldOwner${runId}`;
const secondSession = `wrun_svcArnoldSecond${runId}`;
const otherSession = `wrun_svcArnoldOther${runId}`;
const deleted = `user_svcArnoldDeleted${runId}`;
const deletedSession = `wrun_svcArnoldDeleted${runId}`;

afterAll(async () => {
  await withService((tx) =>
    tx
      .delete(arnoldSessions)
      .where(inArray(arnoldSessions.userId, [owner, other, deleted]))
  );
});

describe("recordArnoldSession", () => {
  it("records the session for the User, once however often it runs", async () => {
    await asUser(owner, (tx) => recordArnoldSession(tx, owner, ownerSession));
    await asUser(owner, (tx) => recordArnoldSession(tx, owner, ownerSession));
    await asUser(owner, (tx) => recordArnoldSession(tx, owner, secondSession));

    expect(
      (await asUser(owner, (tx) => listArnoldSessionIds(tx, owner))).sort()
    ).toEqual([ownerSession, secondSession].sort());
  });

  it("can't record a session for another User", async () => {
    await expect(
      asUser(owner, (tx) => recordArnoldSession(tx, other, otherSession))
    ).rejects.toThrow();
  });

  it("never lists another User's sessions", async () => {
    await asUser(other, (tx) => recordArnoldSession(tx, other, otherSession));

    expect(
      await asUser(other, (tx) => listArnoldSessionIds(tx, other))
    ).toEqual([otherSession]);
    expect(
      await asUser(owner, (tx) => listArnoldSessionIds(tx, other))
    ).toEqual([]);
  });

  it("leaves another User's session alone when its id is recorded again", async () => {
    await asUser(owner, (tx) => recordArnoldSession(tx, owner, otherSession));

    expect(
      await asUser(other, (tx) => listArnoldSessionIds(tx, other))
    ).toEqual([otherSession]);
    expect(
      await asUser(owner, (tx) => listArnoldSessionIds(tx, owner))
    ).not.toContain(otherSession);
  });
});

describe("getArnoldSessionOwner", () => {
  it("names the User a session was recorded for", async () => {
    await asUser(owner, (tx) => recordArnoldSession(tx, owner, ownerSession));

    expect(
      await withService((tx) => getArnoldSessionOwner(tx, ownerSession))
    ).toBe(owner);
  });

  it("returns null for a session nobody recorded", async () => {
    expect(
      await withService((tx) =>
        getArnoldSessionOwner(tx, `wrun_svcArnoldUnknown${runId}`)
      )
    ).toBeNull();
  });
});

describe("a deleted User's Arnold sessions", () => {
  it("stay recorded for the retired id, listed in withService", async () => {
    await asUser(deleted, (tx) =>
      recordArnoldSession(tx, deleted, deletedSession)
    );

    await withService((tx) => deleteUserData(tx, deleted));

    // The webhook resets these; the rows stay as the sessions' ACL
    expect(
      await withService((tx) => listArnoldSessionIds(tx, deleted))
    ).toEqual([deletedSession]);
    expect(
      await withService((tx) => getArnoldSessionOwner(tx, deletedSession))
    ).toBe(deleted);
    // RLS no longer matches the retired id
    expect(
      await asUser(deleted, (tx) => listArnoldSessionIds(tx, deleted))
    ).toEqual([]);
  });

  it("can't be claimed again by the retired id", async () => {
    await expect(
      asUser(deleted, (tx) =>
        recordArnoldSession(tx, deleted, `wrun_svcArnoldDeletedNew${runId}`)
      )
    ).rejects.toThrow();
  });
});
