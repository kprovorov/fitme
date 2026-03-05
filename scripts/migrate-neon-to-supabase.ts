#!/usr/bin/env tsx
/**
 * scripts/migrate-neon-to-supabase.ts
 *
 * One-time data migration: Neon (PostgreSQL) → Supabase
 *
 * Usage:
 *   npx tsx scripts/migrate-neon-to-supabase.ts [options]
 *
 * Options:
 *   --dry-run              Read from Neon and validate all mappings; write nothing to Supabase
 *   --user-email=<email>   Migrate a single user only (recommended for initial testing)
 *   --rollback             Delete all migrated data for --user-email from Supabase
 *   --reset                Delete all migrated data then re-migrate; use with --user-email for one user,
 *                         or omit to reset and re-migrate all users. Auth accounts are never deleted.
 *
 * Required environment variables:
 *   NEON_DATABASE_URL         Connection string for the old Neon PostgreSQL database
 *   SUPABASE_URL              Supabase project URL (same as EXPO_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY Supabase service role key — bypasses RLS
 *
 * User migration behaviour:
 *   If a Neon user has no matching Supabase auth account (matched by email), one is
 *   created automatically via the admin API with email_confirm: true. Passwords are
 *   NOT migrated (incompatible hashing). Each created user must use "Forgot password"
 *   to set a new password before they can log in.
 *
 * Prerequisites (not in app package.json, install for this script):
 *   npm install -D pg @types/pg tsx
 *
 * ─── Neon → Supabase field mapping notes ──────────────────────────────────────
 *
 * Table       | Neon field          | Supabase field        | Notes
 * ------------|---------------------|-----------------------|-------------------------
 * users       | id (bigint)         | auth.users.id (uuid)  | Matched by email
 * users       | rc_user_id (string) | profiles.rc_user_id   | Cast: text → uuid, null if invalid
 * plans       | (all fields)        | (all fields)          | created_at/updated_at preserved
 * exercises   | id (bigint)         | id (uuid)             | Matched by slug (global table)
 *             | (per-user copies)   | (global shared table) | Slug must exist in Supabase
 * workouts    | description (text)  | description (text)    | NOT NULL in Supabase; default '' if null
 *
 * Dropped from Neon (not in Supabase):
 *   - users.name, users.password, users.email_verified_at, etc. (auth is Supabase's concern)
 *
 * Missing from Neon (Supabase default handles):
 *   - All id columns (Supabase generates UUIDs via gen_random_uuid())
 */

import { config as loadDotenv } from "dotenv";
import { Client } from "pg";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Load .env from repo root (ignored if file doesn't exist)
loadDotenv();

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const ROLLBACK = argv.includes("--rollback");
const RESET = argv.includes("--reset");
const USER_EMAIL = argv
  .find((a) => a.startsWith("--user-email="))
  ?.split("=")
  .slice(1)
  .join("=");

if (ROLLBACK && !USER_EMAIL) {
  console.error("Error: --rollback requires --user-email=<email>");
  process.exit(1);
}

if (DRY_RUN) {
  console.log("[DRY RUN MODE] No writes will be made to Supabase.");
}

// ─── Environment ──────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Error: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return val;
}

const NEON_DATABASE_URL = requireEnv("NEON_DATABASE_URL");
const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ─── Neon row types (assumed Laravel-style schema with bigint PKs) ─────────────
// These reflect what is expected in the Neon database. If your Neon schema uses
// different column names, update these types and the SQL queries accordingly.

interface NeonUser {
  id: number;
  email: string;
  name: string | null;
  rc_user_id: string | null;
}

interface NeonProfile {
  id: number;
  user_id: number;
  gender: string;
  age: number;
  weight: string; // pg returns numeric as string
  height: string;
  measurement_system: string;
}

interface NeonPlan {
  id: number;
  user_id: number;
  name: string | null;
  description: string | null;
  goal: string;
  place: string;
  frequency: number;
  is_active: boolean;
  experience_level: string;
  workout_duration: number;
  note: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface NeonWorkout {
  id: number;
  plan_id: number;
  name: string;
  description: string | null;
  order: number;
  created_at: Date;
  updated_at: Date;
}

interface NeonWorkoutExercise {
  id: number;
  workout_id: number;
  exercise_id: number;
  order: number;
  created_at: Date;
  updated_at: Date;
}

interface NeonWorkoutExerciseSet {
  id: number;
  workout_exercise_id: number;
  order: number;
  reps_recommended: number;
  weight_recommended: string;
  rest_recommended: number;
  created_at: Date;
  updated_at: Date;
}

interface NeonWorkoutSession {
  id: number;
  workout_id: number;
  started_at: Date;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface NeonWorkoutSessionExercise {
  id: number;
  workout_session_id: number;
  exercise_id: number;
  order: number;
  created_at: Date;
  updated_at: Date;
}

interface NeonWorkoutSessionExerciseSet {
  id: number;
  workout_session_exercise_id: number;
  order: number;
  reps_recommended: number | null;
  weight_recommended: string | null;
  rest_recommended: number | null;
  reps_completed: number | null;
  weight_completed: string | null;
  logged_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ─── ID maps: Neon integer ID → Supabase UUID ─────────────────────────────────

interface IdMaps {
  plans: Map<number, string>;
  workouts: Map<number, string>;
  workoutExercises: Map<number, string>;
  workoutSessions: Map<number, string>;
  workoutSessionExercises: Map<number, string>;
}

// ─── Structured logger ────────────────────────────────────────────────────────

type LogLevel = "INFO" | "WARN" | "ERROR";

function log(level: LogLevel, entity: string, message: string, extra?: object) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    entity,
    message,
    ...extra,
  };
  const line = JSON.stringify(entry);
  if (level === "ERROR") {
    console.error(line);
  } else {
    console.log(line);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const neon = new Client({ connectionString: NEON_DATABASE_URL });
  await neon.connect();
  log("INFO", "setup", "Connected to Neon");

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // ─── Pre-load exercise slug → Supabase UUID map ────────────────────────
    const slugToSupabaseId = new Map<string, string>();

    const { data: sbExercises, error: sbExErr } = await supabaseAdmin
      .from("exercises")
      .select("id, slug");

    if (sbExErr)
      throw new Error(`Failed to load Supabase exercises: ${sbExErr.message}`);

    for (const ex of sbExercises ?? []) {
      slugToSupabaseId.set(ex.slug, ex.id);
    }
    log(
      "INFO",
      "setup",
      `Loaded ${slugToSupabaseId.size} exercises from Supabase`,
    );

    const { rows: neonExercises } = await neon.query<{
      id: number;
      slug: string;
    }>("SELECT id, slug FROM exercises ORDER BY id");

    const exerciseMap = new Map<number, string>(); // neonId → supabaseUUID
    const missingExerciseSlugs: string[] = [];

    for (const ex of neonExercises) {
      const supabaseId = slugToSupabaseId.get(ex.slug);
      if (!supabaseId) {
        missingExerciseSlugs.push(ex.slug);
        log(
          "WARN",
          "exercises",
          `Neon exercise slug "${ex.slug}" not found in Supabase`,
        );
      } else {
        exerciseMap.set(ex.id, supabaseId);
      }
    }

    log(
      "INFO",
      "setup",
      `Mapped ${exerciseMap.size}/${neonExercises.length} Neon exercises to Supabase`,
      { missing: missingExerciseSlugs.length },
    );

    // ─── Rollback mode ─────────────────────────────────────────────────────
    if (ROLLBACK) {
      await rollbackUser({
        supabaseAdmin,
        email: USER_EMAIL!,
        isDryRun: DRY_RUN,
      });
      return;
    }

    if (RESET) {
      // Determine which emails to reset
      const emailsToReset = USER_EMAIL
        ? [USER_EMAIL]
        : (
            await neon.query<{ email: string }>(
              "SELECT email FROM users ORDER BY id",
            )
          ).rows.map((r) => r.email);

      log("INFO", "reset", `Resetting ${emailsToReset.length} user(s)`);

      for (const email of emailsToReset) {
        await rollbackUser({ supabaseAdmin, email, isDryRun: DRY_RUN });
      }

      log("INFO", "reset", "Reset complete — proceeding with migration");
      // fall through to normal migration below
    }

    // ─── Resolve users to migrate ──────────────────────────────────────────
    let neonUsers: NeonUser[];

    if (USER_EMAIL) {
      const { rows } = await neon.query<NeonUser>(
        "SELECT id, email, name, rc_user_id FROM users WHERE email = $1",
        [USER_EMAIL],
      );
      if (rows.length === 0) {
        log("ERROR", "users", `No Neon user found with email: ${USER_EMAIL}`);
        process.exit(1);
      }
      neonUsers = rows;
    } else {
      const { rows } = await neon.query<NeonUser>(
        "SELECT id, email, name, rc_user_id FROM users ORDER BY id",
      );
      neonUsers = rows;
    }

    log("INFO", "users", `Found ${neonUsers.length} user(s) to migrate`);

    // ─── Migrate each user ─────────────────────────────────────────────────
    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const neonUser of neonUsers) {
      try {
        const result = await migrateUser({
          neon,
          supabaseAdmin,
          neonUser,
          exerciseMap,
          isDryRun: DRY_RUN,
        });

        if (result === "migrated") {
          totalMigrated++;
        } else {
          totalSkipped++;
        }
      } catch (err) {
        log(
          "ERROR",
          "users",
          `Failed to migrate ${neonUser.email}: ${(err as Error).message}`,
        );
        totalErrors++;
      }
    }

    log("INFO", "summary", "Migration complete", {
      total: neonUsers.length,
      migrated: totalMigrated,
      skipped: totalSkipped,
      errors: totalErrors,
      dryRun: DRY_RUN,
    });
  } finally {
    await neon.end();
  }
}

// ─── Rollback ─────────────────────────────────────────────────────────────────

async function rollbackUser(params: {
  supabaseAdmin: SupabaseClient;
  email: string;
  isDryRun: boolean;
}) {
  const { supabaseAdmin, email, isDryRun } = params;

  log("INFO", "rollback", `Starting rollback for ${email}`, {
    dryRun: isDryRun,
  });

  const supabaseUserId = await resolveSupabaseUserId(supabaseAdmin, email);

  if (!supabaseUserId) {
    log(
      "WARN",
      "rollback",
      `No Supabase auth user found with email ${email} — nothing to roll back`,
    );
    return;
  }

  log("INFO", "rollback", `Resolved Supabase user ID: ${supabaseUserId}`);

  if (isDryRun) {
    const { count: planCount } = await supabaseAdmin
      .from("plans")
      .select("*", { count: "exact", head: true })
      .eq("user_id", supabaseUserId);
    const { count: profileCount } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("user_id", supabaseUserId);

    log("INFO", "rollback", "[DRY RUN] Would delete the following", {
      plans: planCount ?? 0,
      profiles: profileCount ?? 0,
      note: "Plans deletion cascades to workouts, workout_exercises, workout_exercise_sets, workout_sessions, workout_session_exercises, workout_session_exercise_sets",
    });
    return;
  }

  const { error: plansErr, count: plansDeleted } = await supabaseAdmin
    .from("plans")
    .delete({ count: "exact" })
    .eq("user_id", supabaseUserId);

  if (plansErr) {
    log("ERROR", "rollback", `Error deleting plans: ${plansErr.message}`);
  } else {
    log("INFO", "rollback", `Deleted plans (and all cascaded child data)`, {
      count: plansDeleted,
    });
  }

  const { error: profileErr, count: profileDeleted } = await supabaseAdmin
    .from("profiles")
    .delete({ count: "exact" })
    .eq("user_id", supabaseUserId);

  if (profileErr) {
    log("ERROR", "rollback", `Error deleting profile: ${profileErr.message}`);
  } else {
    log("INFO", "rollback", `Deleted profile`, { count: profileDeleted });
  }

  log("INFO", "rollback", `Rollback complete for ${email}`);
}

// ─── Migrate single user ──────────────────────────────────────────────────────

interface MigrateUserParams {
  neon: Client;
  supabaseAdmin: SupabaseClient;
  neonUser: NeonUser;
  exerciseMap: Map<number, string>; // neonExerciseId → supabaseExerciseUUID
  isDryRun: boolean;
}

async function migrateUser(
  params: MigrateUserParams,
): Promise<"migrated" | "skipped"> {
  const { neon, supabaseAdmin, neonUser, exerciseMap, isDryRun } = params;

  log("INFO", "user", `Processing ${neonUser.email} (neon id: ${neonUser.id})`);

  // ─── Resolve Supabase auth user by email ────────────────────────────────
  let supabaseUserId = await resolveSupabaseUserId(
    supabaseAdmin,
    neonUser.email,
  );

  if (!supabaseUserId) {
    if (isDryRun) {
      log(
        "INFO",
        "user",
        `[DRY RUN] No Supabase auth user for ${neonUser.email} — would create one`,
      );
    } else {
      const { data: created, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: neonUser.email,
          email_confirm: true,
          user_metadata: neonUser.name ? { full_name: neonUser.name } : {},
        });

      if (createErr) {
        log(
          "ERROR",
          "user",
          `Failed to create Supabase auth user for ${neonUser.email}: ${createErr.message}`,
        );
        return "skipped";
      }

      supabaseUserId = created.user.id;
      log(
        "INFO",
        "user",
        `Created Supabase auth user for ${neonUser.email} — password reset required`,
        { supabaseUserId },
      );
    }
  }

  if (!supabaseUserId) {
    return "skipped";
  }

  // ─── Idempotency: skip if already migrated ─────────────────────────────
  // Profile is inserted LAST and acts as the completion marker. If it exists,
  // the entire migration for this user completed successfully in a prior run.
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", supabaseUserId)
    .maybeSingle();

  if (existingProfile) {
    log(
      "INFO",
      "user",
      `${neonUser.email} already migrated (profile exists) — skipping`,
    );
    return "skipped";
  }

  // ─── Clean up any orphaned data from a previous failed run ─────────────
  const { count: orphanCount } = await supabaseAdmin
    .from("plans")
    .select("*", { count: "exact", head: true })
    .eq("user_id", supabaseUserId);

  if (orphanCount && orphanCount > 0) {
    log(
      "WARN",
      "user",
      `Cleaning up ${orphanCount} orphaned plan(s) from previous failed run`,
      { email: neonUser.email },
    );
    await supabaseAdmin.from("plans").delete().eq("user_id", supabaseUserId);
  }

  // ─── Load all Neon data for this user ──────────────────────────────────

  const {
    rows: [neonProfile],
  } = await neon.query<NeonProfile>(
    "SELECT * FROM profiles WHERE user_id = $1",
    [neonUser.id],
  );

  const { rows: neonPlans } = await neon.query<NeonPlan>(
    "SELECT * FROM plans WHERE user_id = $1 ORDER BY id",
    [neonUser.id],
  );

  const planIds = neonPlans.map((p) => p.id);

  const neonWorkouts = planIds.length
    ? (
        await neon.query<NeonWorkout>(
          "SELECT * FROM workouts WHERE plan_id = ANY($1::bigint[]) ORDER BY id",
          [planIds],
        )
      ).rows
    : [];

  const workoutIds = neonWorkouts.map((w) => w.id);

  const neonWorkoutExercises = workoutIds.length
    ? (
        await neon.query<NeonWorkoutExercise>(
          "SELECT * FROM workout_exercises WHERE workout_id = ANY($1::bigint[]) ORDER BY id",
          [workoutIds],
        )
      ).rows
    : [];

  const workoutExerciseIds = neonWorkoutExercises.map((we) => we.id);

  const neonWorkoutExerciseSets = workoutExerciseIds.length
    ? (
        await neon.query<NeonWorkoutExerciseSet>(
          "SELECT * FROM workout_exercise_sets WHERE workout_exercise_id = ANY($1::bigint[]) ORDER BY id",
          [workoutExerciseIds],
        )
      ).rows
    : [];

  const neonWorkoutSessions = workoutIds.length
    ? (
        await neon.query<NeonWorkoutSession>(
          "SELECT * FROM workout_sessions WHERE workout_id = ANY($1::bigint[]) ORDER BY id",
          [workoutIds],
        )
      ).rows
    : [];

  const sessionIds = neonWorkoutSessions.map((s) => s.id);

  const neonSessionExercises = sessionIds.length
    ? (
        await neon.query<NeonWorkoutSessionExercise>(
          "SELECT * FROM workout_session_exercises WHERE workout_session_id = ANY($1::bigint[]) ORDER BY id",
          [sessionIds],
        )
      ).rows
    : [];

  const sessionExerciseIds = neonSessionExercises.map((se) => se.id);

  const neonSessionExerciseSets = sessionExerciseIds.length
    ? (
        await neon.query<NeonWorkoutSessionExerciseSet>(
          "SELECT * FROM workout_session_exercise_sets WHERE workout_session_exercise_id = ANY($1::bigint[]) ORDER BY id",
          [sessionExerciseIds],
        )
      ).rows
    : [];

  log("INFO", "read", `Neon read counts for ${neonUser.email}`, {
    profile: neonProfile ? 1 : 0,
    plans: neonPlans.length,
    workouts: neonWorkouts.length,
    workoutExercises: neonWorkoutExercises.length,
    workoutExerciseSets: neonWorkoutExerciseSets.length,
    workoutSessions: neonWorkoutSessions.length,
    sessionExercises: neonSessionExercises.length,
    sessionExerciseSets: neonSessionExerciseSets.length,
  });

  // ─── Validate exercise mappings ────────────────────────────────────────
  const unmappedExerciseIds = new Set<number>();
  for (const we of neonWorkoutExercises) {
    if (!exerciseMap.has(we.exercise_id))
      unmappedExerciseIds.add(we.exercise_id);
  }
  for (const se of neonSessionExercises) {
    if (!exerciseMap.has(se.exercise_id))
      unmappedExerciseIds.add(se.exercise_id);
  }

  if (unmappedExerciseIds.size > 0) {
    log(
      "WARN",
      "exercises",
      `${unmappedExerciseIds.size} unmapped exercise ID(s) for ${neonUser.email} — affected rows will be skipped`,
      { ids: [...unmappedExerciseIds] },
    );
  }

  if (isDryRun) {
    log(
      "INFO",
      "dry-run",
      `[DRY RUN] Validated ${neonUser.email} — no writes made`,
    );
    return "migrated";
  }

  // ─── Write to Supabase via JS client (service role bypasses RLS) ──────────
  // Profile is inserted LAST — it acts as the completion marker for idempotency.
  // If the script crashes mid-way, the orphan cleanup above handles the retry.
  // All entities use batchInsertWithIds so we never do more than 100 rows per
  // HTTP request and we get the inserted UUIDs back for ID mapping.
  const idMaps: IdMaps = {
    plans: new Map(),
    workouts: new Map(),
    workoutExercises: new Map(),
    workoutSessions: new Map(),
    workoutSessionExercises: new Map(),
  };

  const counts = {
    profile: { inserted: 0, skipped: 0 },
    plans: { inserted: 0, skipped: 0 },
    workouts: { inserted: 0, skipped: 0 },
    workoutExercises: { inserted: 0, skipped: 0 },
    workoutExerciseSets: { inserted: 0, skipped: 0 },
    workoutSessions: { inserted: 0, skipped: 0 },
    sessionExercises: { inserted: 0, skipped: 0 },
    sessionExerciseSets: { inserted: 0, skipped: 0 },
  };

  // 1. Plans
  log("INFO", "user", `Inserting ${neonPlans.length} plans`);
  {
    const rows = neonPlans.map((plan) => ({
      user_id: supabaseUserId,
      name: plan.name,
      description: plan.description,
      goal: plan.goal,
      place: plan.place,
      frequency: plan.frequency,
      is_active: plan.is_active,
      experience_level: plan.experience_level,
      workout_duration: plan.workout_duration,
      note: plan.note,
      deleted_at: plan.deleted_at?.toISOString() ?? null,
      created_at: plan.created_at.toISOString(),
      updated_at: plan.updated_at.toISOString(),
    }));
    const ids = await batchInsertWithIds(supabaseAdmin, "plans", rows);
    neonPlans.forEach((plan, i) => idMaps.plans.set(plan.id, ids[i]));
    counts.plans.inserted = ids.length;
  }

  // 2. Workouts
  log("INFO", "user", `Inserting ${neonWorkouts.length} workouts`);
  {
    const rows = neonWorkouts.map((workout) => ({
      plan_id: idMaps.plans.get(workout.plan_id)!,
      name: workout.name,
      description: workout.description ?? "", // Supabase column is NOT NULL
      order: workout.order,
      created_at: workout.created_at.toISOString(),
      updated_at: workout.updated_at.toISOString(),
    }));
    const ids = await batchInsertWithIds(supabaseAdmin, "workouts", rows);
    neonWorkouts.forEach((workout, i) =>
      idMaps.workouts.set(workout.id, ids[i]),
    );
    counts.workouts.inserted = ids.length;
  }

  // 3. Workout exercises (skip rows with unmapped exercise slugs)
  log(
    "INFO",
    "user",
    `Inserting ${neonWorkoutExercises.length} workout exercises`,
  );
  {
    const mapped = neonWorkoutExercises.filter((we) => {
      if (!exerciseMap.has(we.exercise_id)) {
        log(
          "WARN",
          "workout_exercises",
          `Skipping workout_exercise ${we.id}: exercise ${we.exercise_id} has no slug match`,
        );
        counts.workoutExercises.skipped++;
        return false;
      }
      return true;
    });
    const rows = mapped.map((we) => ({
      workout_id: idMaps.workouts.get(we.workout_id)!,
      exercise_id: exerciseMap.get(we.exercise_id)!,
      order: we.order,
      created_at: we.created_at.toISOString(),
      updated_at: we.updated_at.toISOString(),
    }));
    const ids = await batchInsertWithIds(
      supabaseAdmin,
      "workout_exercises",
      rows,
    );
    mapped.forEach((we, i) => idMaps.workoutExercises.set(we.id, ids[i]));
    counts.workoutExercises.inserted = ids.length;
  }

  // 4. Workout exercise sets (batch — no ID mapping needed)
  log(
    "INFO",
    "user",
    `Inserting ${neonWorkoutExerciseSets.length} workout exercise sets`,
  );
  {
    const rows = neonWorkoutExerciseSets
      .filter((wes) => idMaps.workoutExercises.has(wes.workout_exercise_id))
      .map((wes) => ({
        workout_exercise_id: idMaps.workoutExercises.get(
          wes.workout_exercise_id,
        )!,
        order: wes.order,
        reps_recommended: wes.reps_recommended,
        weight_recommended: parseFloat(wes.weight_recommended),
        rest_recommended: wes.rest_recommended,
        created_at: wes.created_at.toISOString(),
        updated_at: wes.updated_at.toISOString(),
      }));
    if (rows.length)
      await batchInsert(supabaseAdmin, "workout_exercise_sets", rows);
    counts.workoutExerciseSets.inserted = rows.length;
    counts.workoutExerciseSets.skipped =
      neonWorkoutExerciseSets.length - rows.length;
  }

  // 5. Workout sessions
  log(
    "INFO",
    "user",
    `Inserting ${neonWorkoutSessions.length} workout sessions`,
  );
  {
    const rows = neonWorkoutSessions.map((session) => ({
      workout_id: idMaps.workouts.get(session.workout_id)!,
      started_at: session.started_at.toISOString(),
      finished_at: session.finished_at?.toISOString() ?? null,
      created_at: session.created_at.toISOString(),
      updated_at: session.updated_at.toISOString(),
    }));
    const ids = await batchInsertWithIds(
      supabaseAdmin,
      "workout_sessions",
      rows,
    );
    neonWorkoutSessions.forEach((session, i) =>
      idMaps.workoutSessions.set(session.id, ids[i]),
    );
    counts.workoutSessions.inserted = ids.length;
  }

  // 6. Workout session exercises (skip rows with unmapped exercise slugs)
  log(
    "INFO",
    "user",
    `Inserting ${neonSessionExercises.length} session exercises`,
  );
  {
    const mapped = neonSessionExercises.filter((se) => {
      if (!exerciseMap.has(se.exercise_id)) {
        log(
          "WARN",
          "workout_session_exercises",
          `Skipping session_exercise ${se.id}: exercise ${se.exercise_id} has no slug match`,
        );
        counts.sessionExercises.skipped++;
        return false;
      }
      return true;
    });
    const rows = mapped.map((se) => ({
      workout_session_id: idMaps.workoutSessions.get(se.workout_session_id)!,
      exercise_id: exerciseMap.get(se.exercise_id)!,
      order: se.order,
      created_at: se.created_at.toISOString(),
      updated_at: se.updated_at.toISOString(),
    }));
    const ids = await batchInsertWithIds(
      supabaseAdmin,
      "workout_session_exercises",
      rows,
    );
    mapped.forEach((se, i) =>
      idMaps.workoutSessionExercises.set(se.id, ids[i]),
    );
    counts.sessionExercises.inserted = ids.length;
  }

  // 7. Workout session exercise sets (batch — no ID mapping needed)
  log(
    "INFO",
    "user",
    `Inserting ${neonSessionExerciseSets.length} session exercise sets`,
  );
  {
    const rows = neonSessionExerciseSets
      .filter((ses) =>
        idMaps.workoutSessionExercises.has(ses.workout_session_exercise_id),
      )
      .map((ses) => ({
        workout_session_exercise_id: idMaps.workoutSessionExercises.get(
          ses.workout_session_exercise_id,
        )!,
        order: ses.order,
        reps_recommended: ses.reps_recommended,
        weight_recommended:
          ses.weight_recommended != null
            ? parseFloat(ses.weight_recommended)
            : null,
        rest_recommended: ses.rest_recommended,
        reps_completed: ses.reps_completed,
        weight_completed:
          ses.weight_completed != null
            ? parseFloat(ses.weight_completed)
            : null,
        logged_at: ses.logged_at?.toISOString() ?? null,
        created_at: ses.created_at.toISOString(),
        updated_at: ses.updated_at.toISOString(),
      }));
    if (rows.length)
      await batchInsert(supabaseAdmin, "workout_session_exercise_sets", rows);
    counts.sessionExerciseSets.inserted = rows.length;
    counts.sessionExerciseSets.skipped =
      neonSessionExerciseSets.length - rows.length;
  }

  // 8. Profile — inserted LAST as the completion marker
  if (neonProfile) {
    const rcUserId = isValidUuid(neonUser.rc_user_id)
      ? neonUser.rc_user_id
      : null;
    const { error } = await supabaseAdmin.from("profiles").insert({
      user_id: supabaseUserId,
      gender: neonProfile.gender,
      age: neonProfile.age,
      weight: parseFloat(neonProfile.weight),
      height: parseFloat(neonProfile.height),
      measurement_system: neonProfile.measurement_system,
      rc_user_id: rcUserId,
    });
    if (error) throw new Error(`Failed to insert profile: ${error.message}`);
    counts.profile.inserted++;
  } else {
    log(
      "WARN",
      "profile",
      `No profile in Neon for ${neonUser.email} — skipping profile row`,
    );
    counts.profile.skipped++;
  }

  log("INFO", "user", `Migrated ${neonUser.email} successfully`, { counts });
  return "migrated";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveSupabaseUserId(
  supabaseAdmin: SupabaseClient,
  email: string,
): Promise<string | null> {
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error || !data?.users?.length) break;
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 1000) break;
    page++;
  }
  return null;
}

// Insert rows in chunks; does not return IDs (use for leaf tables like *_sets)
async function batchInsert<T extends object>(
  supabaseAdmin: SupabaseClient,
  table: string,
  rows: T[],
  chunkSize = 100,
): Promise<void> {
  const total = rows.length;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    log(
      "INFO",
      table,
      `Inserting rows ${i + 1}–${Math.min(i + chunkSize, total)} of ${total}`,
    );
    const { error } = await supabaseAdmin.from(table).insert(chunk);
    if (error)
      throw new Error(
        `Failed to insert into ${table} at offset ${i}: ${error.message}`,
      );
  }
}

// Insert rows in chunks and return all inserted UUIDs in input order.
// The returned array is positionally aligned with the input array.
async function batchInsertWithIds<T extends object>(
  supabaseAdmin: SupabaseClient,
  table: string,
  rows: T[],
  chunkSize = 100,
): Promise<string[]> {
  const ids: string[] = [];
  const total = rows.length;
  for (let i = 0; i < total; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    log(
      "INFO",
      table,
      `Inserting rows ${i + 1}–${Math.min(i + chunkSize, total)} of ${total}`,
    );
    const { data, error } = await supabaseAdmin
      .from(table)
      .insert(chunk)
      .select("id");
    if (error)
      throw new Error(
        `Failed to insert into ${table} at offset ${i}: ${error.message}`,
      );
    ids.push(...(data ?? []).map((r: { id: string }) => r.id));
  }
  return ids;
}

function isValidUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
