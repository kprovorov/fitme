import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getConnection } from "./client";

/**
 * The only two doors into Postgres (ADR 0003). Each opens a transaction on the
 * shared fitme login, switches role and sets the JWT claims for that
 * transaction only (SET LOCAL / set_config(…, true)), then runs `fn`.
 *
 * Never use a session-level `SET ROLE` or `set_config(…, false)`: the
 * transaction pooler doesn't reset connections, so session state leaks to
 * other requests.
 */

/** The transaction handed to `asUser` and `withService` callbacks. */
export type Transaction = Parameters<
  Parameters<NodePgDatabase["transaction"]>[0]
>[0];

/** The JWT claims a door sets; `role` is also the database role it switches to. */
interface Claims {
  role: "authenticated" | "service_role";
  sub?: string;
}

const inRoleTransaction = <T>(
  claims: Claims,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> => {
  const { applicationName, db } = getConnection();
  return db.transaction(async (tx) => {
    // role is one of two constants, never input
    await tx.execute(sql.raw(`set local role ${claims.role}`));
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true), set_config('application_name', ${applicationName}, true)`
    );
    return await fn(tx);
  });
};

/**
 * Runs `fn` as the User under RLS: role `authenticated`, and claims whose `sub`
 * is `userId`, so `current_user_id()` returns it. `userId` must come from a
 * verified token, never from request or tool input.
 */
export const asUser = async <T>(
  userId: string,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> => {
  if (!userId) {
    throw new Error("asUser needs a User id");
  }
  return await inRoleTransaction({ role: "authenticated", sub: userId }, fn);
};

/**
 * Runs `fn` as `service_role`, which bypasses RLS and sees every User's rows.
 * Only for system work where that is the point, such as webhooks.
 */
export const withService = async <T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> => await inRoleTransaction({ role: "service_role" }, fn);
