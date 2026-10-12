// One-shot Supabase Auth -> Clerk User migration (FIT-73, ADR 0001). Removed
// together with the legacy auth rows once the cutover is done.
//
// For every Supabase Auth user it creates the Clerk User (verified email,
// split name, the bcrypt digest Supabase stores, legacy UUID as external_id)
// and moves every row the User owns to the Clerk id through rekey_user. A
// rerun finds the Clerk User by external_id instead of creating it again, and
// rekey_user is a no-op for a User whose rows already moved.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import type { Database } from "../src";

const CLERK_API_URL = "https://api.clerk.com/v1";
// GET /users accepts up to 100 external ids per request
const CLERK_LOOKUP_BATCH = 100;
const CLERK_MAX_RETRIES = 5;
const CLERK_RETRY_FALLBACK_MS = 2000;

// Supabase Auth (GoTrue) stores bcrypt digests in modular crypt format, the
// format Clerk's bcrypt hasher accepts
const BCRYPT_DIGEST = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const WHITESPACE = /\s/;
const LEGACY_USER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tables whose user_id rekey_user rewrites; every other User-owned row hangs
// off one of them
export const USER_TABLES = [
  "profiles",
  "plans",
  "workout_sessions",
  "conversations",
] as const;

export interface LegacyUser {
  email: string | null;
  id: string;
  isAnonymous: boolean;
  isDeleted: boolean;
  name: string | null;
  passwordDigest: string | null;
}

export type UserStatus = "created" | "resumed" | "already-migrated" | "skipped";

export interface UserResult {
  clerkId?: string;
  email: string | null;
  legacyId: string;
  // Set when the Clerk User was (or would be) created without a password
  passwordNotImported?: string;
  // Skip reason, or what a dry run would do
  reason?: string;
  rowCount: number;
  status: UserStatus;
}

export interface MigrationReport {
  dryRun: boolean;
  // Rows whose user_id is still a legacy UUID, per table
  legacyRows: Record<(typeof USER_TABLES)[number], number>;
  users: UserResult[];
}

export interface MigrationOptions {
  clerkSecretKey: string;
  databaseUrl: string;
  dryRun: boolean;
  onProgress?: (result: UserResult) => void;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
}

interface ClerkError {
  code?: string;
  long_message?: string;
  message?: string;
  meta?: { param_name?: string };
}

export class ClerkRequestError extends Error {
  // Clerk's own error messages, without the request line
  readonly detail: string;
  readonly errors: ClerkError[];
  readonly status: number;

  constructor(method: string, path: string, status: number, body: string) {
    let errors: ClerkError[] = [];
    try {
      errors = (JSON.parse(body) as { errors?: ClerkError[] }).errors ?? [];
    } catch {
      // Not a Clerk error payload; keep the raw body as the detail
    }
    const detail =
      errors.map((e) => e.long_message ?? e.message ?? e.code).join("; ") ||
      body;
    super(`Clerk ${method} ${path} failed with ${status}: ${detail}`);
    this.detail = detail;
    this.errors = errors;
    this.status = status;
  }
}

export interface ClerkUser {
  email_addresses: {
    email_address: string;
    id: string;
    verification: { status: string } | null;
  }[];
  external_id: string | null;
  first_name: string | null;
  id: string;
  last_name: string | null;
  password_enabled: boolean;
  primary_email_address_id: string | null;
}

export async function clerkRequest<T>(
  secretKey: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  attempt = 0
): Promise<T> {
  const response = await fetch(`${CLERK_API_URL}${path}`, {
    body: body && JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body && { "Content-Type": "application/json" }),
    },
    method,
  });
  // Development instances allow 100 requests per 10 seconds
  if (response.status === 429 && attempt < CLERK_MAX_RETRIES) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        retryAfter > 0 ? retryAfter * 1000 : CLERK_RETRY_FALLBACK_MS
      )
    );
    return clerkRequest(secretKey, method, path, body, attempt + 1);
  }
  if (!response.ok) {
    throw new ClerkRequestError(
      method,
      path,
      response.status,
      await response.text()
    );
  }
  return (await response.json()) as T;
}

async function findClerkUsers(
  secretKey: string,
  param: "external_id" | "email_address",
  values: string[],
  keyOf: (user: ClerkUser) => string[]
): Promise<Map<string, ClerkUser>> {
  const found = new Map<string, ClerkUser>();
  for (let i = 0; i < values.length; i += CLERK_LOOKUP_BATCH) {
    const query = new URLSearchParams({ limit: String(CLERK_LOOKUP_BATCH) });
    for (const value of values.slice(i, i + CLERK_LOOKUP_BATCH)) {
      query.append(param, value);
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequential to stay under Clerk's rate limit
    const users = await clerkRequest<ClerkUser[]>(
      secretKey,
      "GET",
      `/users?${query}`
    );
    for (const user of users) {
      for (const key of keyOf(user)) {
        found.set(key, user);
      }
    }
  }
  return found;
}

/** Clerk Users by external_id, for the given legacy ids. */
export function findClerkUsersByExternalId(
  secretKey: string,
  externalIds: string[]
): Promise<Map<string, ClerkUser>> {
  return findClerkUsers(secretKey, "external_id", externalIds, (user) =>
    user.external_id ? [user.external_id] : []
  );
}

/** Clerk Users by lowercased email address. */
function findClerkUsersByEmail(
  secretKey: string,
  emails: string[]
): Promise<Map<string, ClerkUser>> {
  return findClerkUsers(secretKey, "email_address", emails, (user) =>
    user.email_addresses.map((e) => e.email_address.toLowerCase())
  );
}

/** Splits on the first space: one word is the first name, no name is none. */
export function splitName(name: string | null): {
  first_name?: string;
  last_name?: string;
} {
  const trimmed = name?.trim();
  if (!trimmed) {
    return {};
  }
  const space = trimmed.search(WHITESPACE);
  if (space === -1) {
    return { first_name: trimmed };
  }
  return {
    first_name: trimmed.slice(0, space),
    last_name: trimmed.slice(space + 1).trim() || undefined,
  };
}

/** Why Clerk would reject this digest, or null when it can be imported. */
export function digestProblem(digest: string | null): string | null {
  if (!digest) {
    return "no password set in Supabase Auth";
  }
  if (!BCRYPT_DIGEST.test(digest)) {
    return "password digest is not a bcrypt hash";
  }
  return null;
}

function isPasswordError(error: unknown): error is ClerkRequestError {
  return (
    error instanceof ClerkRequestError &&
    error.status === 422 &&
    error.errors.some(
      (e) =>
        e.meta?.param_name?.startsWith("password") ||
        e.code?.includes("password")
    )
  );
}

/**
 * Creates the Clerk User with the imported password, falling back to no
 * password (forgot-password flow) when Clerk rejects the digest.
 */
async function createClerkUser(
  secretKey: string,
  user: LegacyUser & { email: string }
): Promise<{ clerkUser: ClerkUser; passwordNotImported?: string }> {
  const base = {
    // The Backend API creates email addresses verified
    email_address: [user.email],
    external_id: user.id,
    skip_legal_checks: true,
    ...splitName(user.name),
  };
  const withoutPassword = { ...base, skip_password_requirement: true };

  const problem = digestProblem(user.passwordDigest);
  if (problem) {
    const clerkUser = await clerkRequest<ClerkUser>(
      secretKey,
      "POST",
      "/users",
      withoutPassword
    );
    return { clerkUser, passwordNotImported: problem };
  }

  try {
    const clerkUser = await clerkRequest<ClerkUser>(
      secretKey,
      "POST",
      "/users",
      {
        ...base,
        password_digest: user.passwordDigest,
        password_hasher: "bcrypt",
      }
    );
    return { clerkUser };
  } catch (error) {
    if (!isPasswordError(error)) {
      throw error;
    }
    const clerkUser = await clerkRequest<ClerkUser>(
      secretKey,
      "POST",
      "/users",
      withoutPassword
    );
    return {
      clerkUser,
      passwordNotImported: `Clerk rejected the password digest: ${error.detail}`,
    };
  }
}

async function readLegacyUsers(db: pg.Client): Promise<LegacyUser[]> {
  const { rows } = await db.query<{
    email: string | null;
    encrypted_password: string | null;
    id: string;
    is_anonymous: boolean;
    is_deleted: boolean;
    name: string | null;
  }>(`
    SELECT
      u.id::text AS id,
      u.email,
      u.encrypted_password,
      coalesce(
        nullif(u.raw_user_meta_data ->> 'name', ''),
        u.raw_user_meta_data ->> 'full_name'
      ) AS name,
      coalesce(u.is_anonymous, false) AS is_anonymous,
      u.deleted_at IS NOT NULL AS is_deleted
    FROM auth.users u
    ORDER BY u.created_at, u.id
  `);
  return rows.map((row) => ({
    email: row.email || null,
    id: row.id,
    isAnonymous: row.is_anonymous,
    isDeleted: row.is_deleted,
    name: row.name,
    passwordDigest: row.encrypted_password || null,
  }));
}

/** undefined: not retired; null: deleted; string: rekeyed to that id. */
async function retiredTo(
  db: pg.Client,
  userId: string
): Promise<string | null | undefined> {
  const { rows } = await db.query<{ rekeyed_to: string | null }>(
    "SELECT rekeyed_to FROM private.retired_user_ids WHERE user_id = $1",
    [userId]
  );
  return rows.length === 0 ? undefined : rows[0].rekeyed_to;
}

async function countRows(db: pg.Client, userId: string): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT (${USER_TABLES.map(
      (table) => `(SELECT count(*) FROM public.${table} WHERE user_id = $1)`
    ).join(" + ")})::int AS count`,
    [userId]
  );
  return rows[0].count;
}

async function countLegacyRows(
  db: pg.Client
): Promise<MigrationReport["legacyRows"]> {
  const { rows } = await db.query<{
    count: number;
    table: (typeof USER_TABLES)[number];
  }>(
    USER_TABLES.map(
      (table) =>
        `SELECT '${table}' AS table, count(*)::int AS count FROM public.${table} WHERE user_id ~* $1`
    ).join(" UNION ALL "),
    [LEGACY_USER_ID.source]
  );
  return Object.fromEntries(
    rows.map((row) => [row.table, row.count])
  ) as MigrationReport["legacyRows"];
}

async function rekey(
  supabase: SupabaseClient<Database>,
  oldId: string,
  newId: string
): Promise<void> {
  const { error } = await supabase.rpc("rekey_user", {
    new_id: newId,
    old_id: oldId,
  });
  if (error) {
    throw new Error(`rekey_user failed: ${error.message}`);
  }
}

interface MigrationContext {
  clerkSecretKey: string;
  clerkUsers: Map<string, ClerkUser>;
  // Clerk Users already holding a legacy User's email, looked up in dry runs
  // only: a real run reports the conflict when creation fails
  clerkUsersByEmail: Map<string, ClerkUser>;
  db: pg.Client;
  dryRun: boolean;
  supabase: SupabaseClient<Database>;
}

function ineligibleReason(user: LegacyUser): string | null {
  if (user.isDeleted) {
    return "deleted in Supabase Auth";
  }
  if (user.isAnonymous) {
    return "anonymous user";
  }
  if (!user.email) {
    return "no email address";
  }
  return null;
}

function planDryRun(
  ctx: MigrationContext,
  user: LegacyUser & { email: string },
  result: UserResult
): UserResult {
  const existing = ctx.clerkUsers.get(user.id);
  if (existing) {
    return {
      ...result,
      clerkId: existing.id,
      reason: `would rekey rows to existing Clerk User ${existing.id}`,
      status: "resumed",
    };
  }
  const conflict = ctx.clerkUsersByEmail.get(user.email.toLowerCase());
  if (conflict) {
    return {
      ...result,
      reason: `would fail: Clerk User ${conflict.id} already has this email address`,
    };
  }
  const problem = digestProblem(user.passwordDigest);
  return {
    ...result,
    passwordNotImported: problem ?? undefined,
    reason: problem
      ? "would create Clerk User without a password and rekey rows"
      : "would create Clerk User with imported password and rekey rows",
    status: "created",
  };
}

async function createAndRekey(
  ctx: MigrationContext,
  user: LegacyUser & { email: string },
  result: UserResult
): Promise<UserResult> {
  const existing = ctx.clerkUsers.get(user.id);
  let clerkId = existing?.id;
  let passwordNotImported: string | undefined;
  if (!clerkId) {
    try {
      const { clerkUser, passwordNotImported: problem } = await createClerkUser(
        ctx.clerkSecretKey,
        user
      );
      clerkId = clerkUser.id;
      passwordNotImported = problem;
      ctx.clerkUsers.set(user.id, clerkUser);
    } catch (error) {
      return {
        ...result,
        reason: `Clerk User creation failed: ${error instanceof ClerkRequestError ? error.detail : String(error)}`,
      };
    }
  }

  try {
    await rekey(ctx.supabase, user.id, clerkId);
  } catch (error) {
    // The Clerk User exists now; a rerun picks it up by external_id
    return {
      ...result,
      clerkId,
      passwordNotImported,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ...result,
    clerkId,
    passwordNotImported,
    status: existing ? "resumed" : "created",
  };
}

async function migrateUser(
  ctx: MigrationContext,
  user: LegacyUser
): Promise<UserResult> {
  const result: UserResult = {
    email: user.email,
    legacyId: user.id,
    rowCount: await countRows(ctx.db, user.id),
    status: "skipped",
  };

  const ineligible = ineligibleReason(user);
  if (ineligible || !user.email) {
    return { ...result, reason: ineligible ?? "no email address" };
  }
  const eligible = { ...user, email: user.email };

  const retired = await retiredTo(ctx.db, user.id);
  if (retired === null) {
    return { ...result, reason: "User data was deleted (id is retired)" };
  }
  if (retired !== undefined) {
    const existing = ctx.clerkUsers.get(user.id);
    if (existing?.id === retired) {
      return {
        ...result,
        clerkId: existing.id,
        rowCount: await countRows(ctx.db, existing.id),
        status: "already-migrated",
      };
    }
    return {
      ...result,
      reason: existing
        ? `rows were rekeyed to ${retired}, but the Clerk User with this external_id is ${existing.id}`
        : `rows were rekeyed to ${retired}, but no Clerk User has this external_id`,
    };
  }

  return ctx.dryRun
    ? planDryRun(ctx, eligible, result)
    : createAndRekey(ctx, eligible, result);
}

export async function migrateUsers(
  options: MigrationOptions
): Promise<MigrationReport> {
  const db = new pg.Client({ connectionString: options.databaseUrl });
  await db.connect();
  try {
    const supabase = createClient<Database>(
      options.supabaseUrl,
      options.supabaseServiceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const legacyUsers = await readLegacyUsers(db);
    const clerkUsers = await findClerkUsersByExternalId(
      options.clerkSecretKey,
      legacyUsers.map((user) => user.id)
    );
    const unmatchedEmails = legacyUsers.flatMap((user) =>
      user.email && !clerkUsers.has(user.id) ? [user.email.toLowerCase()] : []
    );
    const ctx: MigrationContext = {
      clerkSecretKey: options.clerkSecretKey,
      clerkUsers,
      clerkUsersByEmail: options.dryRun
        ? await findClerkUsersByEmail(options.clerkSecretKey, unmatchedEmails)
        : new Map(),
      db,
      dryRun: options.dryRun,
      supabase,
    };

    const users: UserResult[] = [];
    for (const user of legacyUsers) {
      // biome-ignore lint/performance/noAwaitInLoops: one User at a time keeps Clerk under its rate limit and the progress log ordered
      const result = await migrateUser(ctx, user);
      users.push(result);
      options.onProgress?.(result);
    }

    return {
      dryRun: options.dryRun,
      legacyRows: await countLegacyRows(db),
      users,
    };
  } finally {
    await db.end();
  }
}
