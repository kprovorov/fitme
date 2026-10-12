// End-to-end check of the Supabase Auth -> Clerk User migration against a
// local Supabase stack and the Clerk development instance: signs up legacy
// users with data, dry-runs, runs and reruns the migration and checks the
// Clerk Users and rows after each step. Deletes everything it created.
//
// Migrates every user in auth.users, so it refuses anything but a local stack
// and a development Clerk key, and expects no other users to exist.
//
// Env: CLERK_SECRET_KEY (development instance, sk_test_…), SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import type { Database } from "../src";
import {
  type ClerkUser,
  clerkRequest,
  findClerkUsersByExternalId,
  type MigrationReport,
  migrateUsers,
  USER_TABLES,
} from "./clerk-migration";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

interface Fixture {
  // Breaks the stored digest; the script's bcrypt format check catches it
  // before Clerk sees it
  corruptDigest?: boolean;
  expectedName: { first_name: string | null; last_name: string | null };
  name?: string;
}

const FIXTURES: Fixture[] = [
  {
    expectedName: { first_name: "Ada", last_name: "Lovelace King" },
    name: "Ada Lovelace King",
  },
  { expectedName: { first_name: "Plato", last_name: null }, name: "Plato" },
  { expectedName: { first_name: null, last_name: null } },
  {
    corruptDigest: true,
    expectedName: { first_name: "Broken", last_name: "Digest" },
    name: "Broken Digest",
  },
];

interface LegacyFixture extends Fixture {
  email: string;
  id: string;
  password: string;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Check failed: ${message}`);
  }
}

function ensureEqual(actual: unknown, expected: unknown, message: string) {
  const [a, e] = [JSON.stringify(actual), JSON.stringify(expected)];
  ensure(a === e, `${message}\n  expected ${e}\n  got      ${a}`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

async function rowOwners(db: pg.Client): Promise<string[]> {
  const { rows } = await db.query<{ owner: string }>(
    USER_TABLES.map(
      (table) => `SELECT '${table}:' || user_id AS owner FROM public.${table}`
    ).join(" UNION ALL ")
  );
  return rows.map((row) => row.owner).sort();
}

function statuses(report: MigrationReport): string[] {
  return report.users.map((user) => user.status);
}

async function main() {
  const clerkSecretKey = requireEnv("CLERK_SECRET_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const databaseUrl = requireEnv("SUPABASE_DB_URL");

  if (!clerkSecretKey.startsWith("sk_test_")) {
    throw new Error("CLERK_SECRET_KEY must be a development key (sk_test_…)");
  }
  for (const url of [supabaseUrl, databaseUrl]) {
    if (!LOCAL_HOSTS.has(new URL(url).hostname.replace(/^\[|\]$/g, ""))) {
      throw new Error(`Refusing to run against a non-local stack: ${url}`);
    }
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();

  const { rows: existing } = await db.query("SELECT 1 FROM auth.users LIMIT 1");
  if (existing.length > 0) {
    await db.end();
    throw new Error("auth.users is not empty; run this on a fresh local stack");
  }

  const legacy: LegacyFixture[] = [];
  const options = {
    clerkSecretKey,
    databaseUrl,
    supabaseServiceRoleKey,
    supabaseUrl,
  };

  try {
    for (const fixture of FIXTURES) {
      const email = `migration-check-${randomUUID()}+clerk_test@fitmeproject.com`;
      const password = randomUUID();
      // biome-ignore lint/performance/noAwaitInLoops: users are created in order so the migration reports them in fixture order
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
        user_metadata: fixture.name ? { name: fixture.name } : {},
      });
      if (error) {
        throw error;
      }
      const { id } = data.user;
      legacy.push({ ...fixture, email, id, password });

      if (fixture.corruptDigest) {
        await db.query(
          "UPDATE auth.users SET encrypted_password = 'not-a-bcrypt-digest' WHERE id = $1",
          [id]
        );
      }

      // One row of every User-owned kind, plus the children rekey_user
      // leaves in place
      await db.query(
        `WITH profile AS (
           INSERT INTO public.profiles (user_id, gender, age, weight, height)
           VALUES ($1, 'female', 30, 60, 170)
         ), plan AS (
           INSERT INTO public.plans (user_id, goal, place, frequency)
           VALUES ($1, 'strength', 'gym', 3) RETURNING id
         ), workout AS (
           INSERT INTO public.workouts (plan_id, "order", name, description)
           SELECT id, 1, 'Day', 'Legs' FROM plan RETURNING id, plan_id
         ), session AS (
           INSERT INTO public.workout_sessions (workout_id, plan_id, user_id, started_at)
           SELECT id, plan_id, $1, now() FROM workout
         ), conversation AS (
           INSERT INTO public.conversations (user_id) VALUES ($1) RETURNING id
         )
         INSERT INTO public.messages (conversation_id, role, content)
         SELECT id, 'user', 'hello' FROM conversation`,
        [id]
      );
    }
    const legacyIds = legacy.map((user) => user.id);
    const ownersBefore = await rowOwners(db);

    // Dry run: nothing written, every user planned, the broken digest flagged
    const dryRun = await migrateUsers({ ...options, dryRun: true });
    ensureEqual(
      statuses(dryRun),
      legacy.map(() => "created"),
      "dry run plans to create every user"
    );
    ensureEqual(
      dryRun.users.map((user) => Boolean(user.passwordNotImported)),
      legacy.map((user) => Boolean(user.corruptDigest)),
      "dry run flags exactly the digest Clerk would reject"
    );
    ensureEqual(
      (await findClerkUsersByExternalId(clerkSecretKey, legacyIds)).size,
      0,
      "dry run creates no Clerk Users"
    );
    ensureEqual(await rowOwners(db), ownersBefore, "dry run moves no rows");

    // Run
    const run = await migrateUsers({ ...options, dryRun: false });
    ensureEqual(
      statuses(run),
      legacy.map(() => "created"),
      `run creates every user: ${JSON.stringify(run.users)}`
    );
    const clerkUsers = await findClerkUsersByExternalId(
      clerkSecretKey,
      legacyIds
    );
    ensureEqual(clerkUsers.size, legacy.length, "one Clerk User per user");

    for (const user of legacy) {
      const clerkUser = clerkUsers.get(user.id) as ClerkUser;
      const email = clerkUser.email_addresses.find(
        (e) => e.id === clerkUser.primary_email_address_id
      );
      ensureEqual(email?.email_address, user.email, "primary email");
      ensureEqual(email?.verification?.status, "verified", "email verified");
      ensureEqual(
        clerkUser.first_name,
        user.expectedName.first_name,
        "first name"
      );
      ensureEqual(
        clerkUser.last_name,
        user.expectedName.last_name,
        "last name"
      );
      ensureEqual(
        clerkUser.password_enabled,
        !user.corruptDigest,
        `password imported for ${user.email}`
      );
      if (!user.corruptDigest) {
        // biome-ignore lint/performance/noAwaitInLoops: sequential to stay under Clerk's rate limit
        const { verified } = await clerkRequest<{ verified: boolean }>(
          clerkSecretKey,
          "POST",
          `/users/${clerkUser.id}/verify_password`,
          { password: user.password }
        );
        ensure(verified, "the imported password signs in");
      }
    }
    ensure(
      run.users.find(
        (result) =>
          result.legacyId === legacy.find((user) => user.corruptDigest)?.id
      )?.passwordNotImported,
      "the summary lists the user whose password was not imported"
    );

    const expectedOwners = ownersBefore
      .map((owner) => {
        const [table, id] = owner.split(":");
        return `${table}:${(clerkUsers.get(id) as ClerkUser).id}`;
      })
      .sort();
    const ownersAfter = await rowOwners(db);
    ensureEqual(ownersAfter, expectedOwners, "rows moved to the Clerk ids");
    ensureEqual(
      Object.values(run.legacyRows),
      USER_TABLES.map(() => 0),
      "no row carries a legacy UUID"
    );

    // Rerun: nothing created, nothing moved
    const rerun = await migrateUsers({ ...options, dryRun: false });
    ensureEqual(
      statuses(rerun),
      legacy.map(() => "already-migrated"),
      "rerun finds every user migrated"
    );
    const afterRerun = await findClerkUsersByExternalId(
      clerkSecretKey,
      legacyIds
    );
    ensureEqual(
      [...afterRerun.values()].map((user) => user.id).sort(),
      [...clerkUsers.values()].map((user) => user.id).sort(),
      "rerun creates no duplicate Clerk Users"
    );
    ensureEqual(await rowOwners(db), ownersAfter, "rerun moves no rows");

    console.log(
      `Migrated ${legacy.length} users into the Clerk development instance; rerun and dry run wrote nothing.`
    );
  } finally {
    // A failed cleanup must not mask the outcome of the check
    const created = await findClerkUsersByExternalId(
      clerkSecretKey,
      legacy.map((user) => user.id)
    ).catch(() => new Map<string, ClerkUser>());
    for (const user of created.values()) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential to stay under Clerk's rate limit
      await clerkRequest(clerkSecretKey, "DELETE", `/users/${user.id}`).catch(
        (err) => console.error(`Failed to delete Clerk user ${user.id}:`, err)
      );
    }
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
