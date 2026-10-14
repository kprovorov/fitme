import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeConnection, getConnection } from "../src/client";
import { asUser, type Transaction, withService } from "../src/index";

/**
 * asUser / withService against a local Supabase stack through the Supavisor
 * transaction pooler, as the fitme login (ADR 0003). Ports the pooler
 * isolation test in docs/research/remove-rpcs-business-layer.md (§9.3).
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const userA = `user_dbA${runId}`;
const userB = `user_dbB${runId}`;
const concurrentUsers = Array.from(
  { length: 20 },
  (_, index) => `user_dbC${index}x${runId}`
);
const everyUser = [userA, userB, ...concurrentUsers];

const CONCURRENT_TRANSACTIONS = 300;
const THROW_EVERY = 7;
const SQL_ERROR_EVERY = 11;
const BARE_QUERIES = 60;
const RLS_VIOLATION = /row-level security/;
const PERMISSION_DENIED = /permission denied/;

const identity = async (tx: Transaction) => {
  const { rows } = await tx.execute<{
    login: string;
    role: string;
    user_id: string | null;
  }>(
    sql`select public.current_user_id() as user_id, current_user as role, session_user as login`
  );
  return rows[0];
};

const conversationOwners = async (tx: Transaction, userIds: string[]) => {
  const { rows } = await tx.execute<{ user_id: string }>(
    sql`select user_id from public.conversations where user_id in ${userIds} order by user_id`
  );
  return rows.map((row) => row.user_id);
};

const insertConversation = (tx: Transaction, userId: string) =>
  tx.execute(
    sql`insert into public.conversations (user_id) values (${userId})`
  );

beforeAll(async () => {
  await withService(async (tx) => {
    await insertConversation(tx, userA);
    await insertConversation(tx, userB);
  });
});

afterAll(async () => {
  await withService((tx) =>
    tx.execute(
      sql`delete from public.conversations where user_id in ${everyUser}`
    )
  );
  await closeConnection();
});

describe("asUser", () => {
  it("runs as the User through the pooler", async () => {
    expect(await asUser(userA, identity)).toEqual({
      login: "fitme",
      role: "authenticated",
      user_id: userA,
    });
  });

  it("limits reads to the User's rows", async () => {
    expect(
      await asUser(userA, (tx) => conversationOwners(tx, [userA, userB]))
    ).toEqual([userA]);
  });

  it("lets the User write their own rows", async () => {
    await asUser(userA, (tx) => insertConversation(tx, userA));

    expect(
      await withService((tx) => conversationOwners(tx, [userA]))
    ).toHaveLength(2);
  });

  it("refuses writes to another User's rows", async () => {
    await expect(
      asUser(userA, (tx) => insertConversation(tx, userB))
    ).rejects.toMatchObject({
      // Drizzle wraps the Postgres error
      cause: { message: expect.stringMatching(RLS_VIOLATION) },
    });

    const changed = await asUser(userA, async (tx) => {
      const updated = await tx.execute(
        sql`update public.conversations set created_at = now() where user_id = ${userB}`
      );
      const deleted = await tx.execute(
        sql`delete from public.conversations where user_id = ${userB}`
      );
      return [updated.rowCount, deleted.rowCount];
    });

    expect(changed).toEqual([0, 0]);
    expect(await withService((tx) => conversationOwners(tx, [userB]))).toEqual([
      userB,
    ]);
  });

  it("rolls back when the callback throws", async () => {
    const [rolledBack] = concurrentUsers;

    await expect(
      asUser(rolledBack, async (tx) => {
        await insertConversation(tx, rolledBack);
        throw new Error("abort");
      })
    ).rejects.toThrow("abort");

    expect(
      await withService((tx) => conversationOwners(tx, [rolledBack]))
    ).toEqual([]);
  });

  it("rejects an empty User id", async () => {
    await expect(asUser("", identity)).rejects.toThrow(
      "asUser needs a User id"
    );
  });
});

describe("withService", () => {
  it("runs as service_role, with no User", async () => {
    expect(await withService(identity)).toEqual({
      login: "fitme",
      role: "service_role",
      user_id: null,
    });
  });

  it("sees every User's rows", async () => {
    const owners = await withService((tx) =>
      conversationOwners(tx, [userA, userB])
    );

    expect(new Set(owners)).toEqual(new Set([userA, userB]));
  });
});

describe("on the pooler", () => {
  const backendPids = new Set<number>();

  it("never shows a concurrent transaction another User's id", async () => {
    const mismatches: string[] = [];

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_TRANSACTIONS }, (_, index) => {
        const userId = concurrentUsers[index % concurrentUsers.length];
        return asUser(userId, async (tx) => {
          const { rows } = await tx.execute<{
            after: string | null;
            before: string | null;
            pid: number;
          }>(
            sql`select public.current_user_id() as before, pg_sleep(random() * 0.02), public.current_user_id() as after, pg_backend_pid() as pid`
          );
          const { after, before, pid } = rows[0];
          backendPids.add(pid);
          if (before !== userId || after !== userId) {
            mismatches.push(`${userId} saw ${before} / ${after}`);
          }
          if (index % THROW_EVERY === 0) {
            throw new Error("thrown");
          }
          if (index % SQL_ERROR_EVERY === 0) {
            await tx.execute(sql`select 1 / 0`);
          }
          return userId;
        });
      })
    );

    const rejected = results.filter((result) => result.status === "rejected");
    const expectedFailures = Array.from(
      { length: CONCURRENT_TRANSACTIONS },
      (_, index) => index
    ).filter(
      (index) => index % THROW_EVERY === 0 || index % SQL_ERROR_EVERY === 0
    ).length;

    expect(mismatches).toEqual([]);
    expect(rejected).toHaveLength(expectedFailures);
  });

  it("leaves reused connections with the role reset and no claims", async () => {
    const { pool } = getConnection();

    const rows = await Promise.all(
      Array.from({ length: BARE_QUERIES }, async () => {
        const {
          rows: [row],
        } = await pool.query<{
          claims: string | null;
          pid: number;
          role: string;
        }>(
          "select current_user as role, current_setting('request.jwt.claims', true) as claims, pg_backend_pid() as pid"
        );
        return row;
      })
    );

    for (const row of rows) {
      expect(row.role).toBe("fitme");
      expect(row.claims ?? "").toBe("");
    }
    // The bare queries ran on server connections the transactions used
    expect(rows.some((row) => backendPids.has(row.pid))).toBe(true);
  });

  it("denies the fitme login outside both doors", async () => {
    const { pool } = getConnection();

    await expect(
      pool.query("select user_id from public.conversations limit 1")
    ).rejects.toThrow(PERMISSION_DENIED);
  });
});
