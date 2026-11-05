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
import { withUserTablesLocked } from "./delete-test-users";

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

describe(recordArnoldSession, () => {
  it("records the session for the User, once however often it runs", async () => {
    await asUser(owner, async (tx) => {
      await recordArnoldSession(tx, owner, ownerSession);
    });
    await asUser(owner, async (tx) => {
      await recordArnoldSession(tx, owner, ownerSession);
    });
    await asUser(owner, async (tx) => {
      await recordArnoldSession(tx, owner, secondSession);
    });

    expect(
      (
        await asUser(owner, async (tx) => await listArnoldSessionIds(tx, owner))
      ).sort()
    ).toEqual([ownerSession, secondSession].sort());
  });

  it("can't record a session for another User", async () => {
    await expect(
      asUser(owner, async (tx) => {
        await recordArnoldSession(tx, other, otherSession);
      })
    ).rejects.toThrow();
  });

  it("never lists another User's sessions", async () => {
    await asUser(other, async (tx) => {
      await recordArnoldSession(tx, other, otherSession);
    });

    await expect(
      asUser(other, async (tx) => await listArnoldSessionIds(tx, other))
    ).resolves.toEqual([otherSession]);
    await expect(
      asUser(owner, async (tx) => await listArnoldSessionIds(tx, other))
    ).resolves.toEqual([]);
  });

  it("leaves another User's session alone when its id is recorded again", async () => {
    await asUser(owner, async (tx) => {
      await recordArnoldSession(tx, owner, otherSession);
    });

    await expect(
      asUser(other, async (tx) => await listArnoldSessionIds(tx, other))
    ).resolves.toEqual([otherSession]);
    await expect(
      asUser(owner, async (tx) => await listArnoldSessionIds(tx, owner))
    ).resolves.not.toContain(otherSession);
  });
});

describe(getArnoldSessionOwner, () => {
  it("names the User a session was recorded for", async () => {
    await asUser(owner, async (tx) => {
      await recordArnoldSession(tx, owner, ownerSession);
    });

    await expect(
      withService(async (tx) => await getArnoldSessionOwner(tx, ownerSession))
    ).resolves.toBe(owner);
  });

  it("returns null for a session nobody recorded", async () => {
    await expect(
      withService(
        async (tx) =>
          await getArnoldSessionOwner(tx, `wrun_svcArnoldUnknown${runId}`)
      )
    ).resolves.toBeNull();
  });
});

describe("a deleted User's Arnold sessions", () => {
  it("stay recorded for the retired id, listed in withService", async () => {
    await asUser(deleted, async (tx) => {
      await recordArnoldSession(tx, deleted, deletedSession);
    });

    await withUserTablesLocked(async (tx) => {
      await deleteUserData(tx, deleted);
    });

    // The webhook resets these; the rows stay as the sessions' ACL
    await expect(
      withService(async (tx) => await listArnoldSessionIds(tx, deleted))
    ).resolves.toEqual([deletedSession]);
    await expect(
      withService(async (tx) => await getArnoldSessionOwner(tx, deletedSession))
    ).resolves.toBe(deleted);
    // RLS no longer matches the retired id
    await expect(
      asUser(deleted, async (tx) => await listArnoldSessionIds(tx, deleted))
    ).resolves.toEqual([]);
  });

  it("can't be claimed again by the retired id", async () => {
    await expect(
      asUser(deleted, async (tx) => {
        await recordArnoldSession(
          tx,
          deleted,
          `wrun_svcArnoldDeletedNew${runId}`
        );
      })
    ).rejects.toThrow();
  });
});
