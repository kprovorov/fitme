import {
  personalRecords,
  plans,
  withService,
  workoutExercises,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import type { Transaction } from "@fitme/db";
import { LibraryBundleV2 } from "@fitme/library-bundle/v2";
import { lockPersonalRecordHistory } from "@fitme/services/personal-records";
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

/** Old Exercise slug → the slug replacing it (the v2 bundle's `replaced_slugs`). */
export type SlugMap = Readonly<Record<string, string>>;

/** The bundle has no `replaced_slugs`, or an empty one: there is nothing to rewrite. */
export class EmptySlugMapError extends Error {
  constructor() {
    super(
      "The Library v2 bundle has no replaced_slugs; there is nothing to rewrite"
    );
    this.name = "EmptySlugMapError";
  }
}

/**
 * The `replaced_slugs` of a parsed v2 bundle, validated against the v2 schema
 * (every value one of the bundle's Exercises, no key one of them); an invalid
 * bundle throws every problem with its path.
 */
export const readReplacedSlugs = (json: unknown): SlugMap => {
  const parsed = LibraryBundleV2.safeParse(json);

  if (!parsed.success) {
    throw new Error(
      `Invalid Library v2 bundle: ${parsed.error.issues
        .map((issue) =>
          issue.path.length > 0
            ? `${issue.path.join(".")}: ${issue.message}`
            : issue.message
        )
        .join("; ")}`
    );
  }

  return parsed.data.replaced_slugs ?? {};
};

/** What one User's rows got (or, on a dry run, would get). */
export interface UserRewrite {
  /** Personal records deleted: the worse of two landing on one slug in a Workout Session. */
  personalRecordsDropped: number;
  /** Personal records moved to their new slug. */
  personalRecords: number;
  userId: string;
  workoutExercises: number;
  workoutSessionExercises: number;
}

export interface RewriteReport {
  users: UserRewrite[];
  /** Rows changed (rewritten or deleted); always 0 on a dry run. */
  written: number;
}

export interface RewriteOptions {
  /** Count what would change, write nothing and take no locks. */
  dryRun?: boolean;
  /** One line per User and a total: ids and counts only, never User data. */
  log?: (line: string) => void;
  map: SlugMap;
  /** Only these Users (tests sharing a stack); every User by default. */
  userIds?: readonly string[];
}

/** Passes over the Users still holding an old slug before giving up. */
const MAX_PASSES = 3;

/** The slug replacing `slug`, or `undefined` for one the map doesn't replace (never an inherited member). */
const targetOf = (map: SlugMap, slug: string): string | undefined =>
  Object.hasOwn(map, slug) ? map[slug] : undefined;

/** The map as a `jsonb_each_text` row source: `(key, value)` = `(old, new)`. */
const mapRows = (map: SlugMap): SQL =>
  sql`jsonb_each_text(${JSON.stringify(map)}::jsonb)`;

const oldSlugs = (map: SlugMap): SQL =>
  sql`(select jsonb_object_keys(${JSON.stringify(map)}::jsonb))`;

/** The Users with a row under an old slug, in id order. */
const listUsers = async (
  tx: Transaction,
  map: SlugMap,
  userIds?: readonly string[]
): Promise<string[]> => {
  const scope = userIds
    ? sql`where u.user_id in (select jsonb_array_elements_text(${JSON.stringify(userIds)}::jsonb))`
    : sql``;

  const result = await tx.execute<{ user_id: string }>(sql`
    select distinct u.user_id from (
      select ${plans.userId} as user_id
        from ${workoutExercises}
        join ${workouts} on ${workouts.id} = ${workoutExercises.workoutId}
        join ${plans} on ${plans.id} = ${workouts.planId}
        where ${workoutExercises.exerciseSlug} in ${oldSlugs(map)}
      union
      select ${workoutSessions.userId}
        from ${workoutSessionExercises}
        join ${workoutSessions} on ${workoutSessions.id} = ${workoutSessionExercises.workoutSessionId}
        where ${workoutSessionExercises.exerciseSlug} in ${oldSlugs(map)}
      union
      select ${personalRecords.userId}
        from ${personalRecords}
        where ${personalRecords.exerciseSlug} in ${oldSlugs(map)}
    ) u
    ${scope}
    order by u.user_id
  `);

  return result.rows.map((row) => row.user_id);
};

interface StoredRecord {
  exercise_slug: string;
  id: string;
  reps: number;
  weight: string;
  workout_session_id: string;
}

/** Better first: higher weight, then more reps, then one already on its new slug, then by id. */
const better =
  (map: SlugMap) =>
  (a: StoredRecord, b: StoredRecord): number =>
    Number(b.weight) - Number(a.weight) ||
    b.reps - a.reps ||
    Number(targetOf(map, a.exercise_slug) !== undefined) -
      Number(targetOf(map, b.exercise_slug) !== undefined) ||
    a.id.localeCompare(b.id);

/**
 * Which of the User's Personal records move to their new slug and which are
 * dropped: within a Workout Session, records landing on one slug keep the
 * better one (`better`), since a Workout Session holds one per Exercise.
 */
const planRecords = (records: StoredRecord[], map: SlugMap) => {
  const groups = new Map<string, StoredRecord[]>();

  for (const record of records) {
    const target = targetOf(map, record.exercise_slug) ?? record.exercise_slug;
    const key = `${record.workout_session_id} ${target}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const moves: { id: string; slug: string }[] = [];
  const drops: string[] = [];

  for (const group of groups.values()) {
    const [winner, ...losers] = group.toSorted(better(map));
    const target = winner ? targetOf(map, winner.exercise_slug) : undefined;

    // A group with no old slug in it is left alone; losers only exist when
    // an old slug lands next to another record
    if (!winner || (target === undefined && losers.length === 0)) {
      continue;
    }

    drops.push(...losers.map((loser) => loser.id));

    if (target !== undefined) {
      moves.push({ id: winner.id, slug: target });
    }
  }

  return { drops, moves };
};

/** The User's Personal records in every Workout Session holding one under an old slug. */
const affectedRecords = async (
  tx: Transaction,
  userId: string,
  map: SlugMap,
  lock: boolean
): Promise<StoredRecord[]> => {
  const result = await tx.execute<{
    exercise_slug: string;
    id: string;
    reps: number;
    weight: string;
    workout_session_id: string;
  }>(sql`
    select id, workout_session_id, exercise_slug, weight, reps
      from ${personalRecords}
      where ${personalRecords.userId} = ${userId}
        and ${personalRecords.workoutSessionId} in (
          select ${personalRecords.workoutSessionId} from ${personalRecords}
            where ${personalRecords.userId} = ${userId}
              and ${personalRecords.exerciseSlug} in ${oldSlugs(map)}
        )
      order by id
      ${lock ? sql`for update` : sql``}
  `);

  return result.rows;
};

const countOld = async (tx: Transaction, userId: string, map: SlugMap) => {
  const result = await tx.execute<{ wse: number; we: number }>(sql`
    select
      (select count(*)::int
        from ${workoutExercises}
        join ${workouts} on ${workouts.id} = ${workoutExercises.workoutId}
        join ${plans} on ${plans.id} = ${workouts.planId}
        where ${plans.userId} = ${userId}
          and ${workoutExercises.exerciseSlug} in ${oldSlugs(map)}) as we,
      (select count(*)::int
        from ${workoutSessionExercises}
        join ${workoutSessions} on ${workoutSessions.id} = ${workoutSessionExercises.workoutSessionId}
        where ${workoutSessions.userId} = ${userId}
          and ${workoutSessionExercises.exerciseSlug} in ${oldSlugs(map)}) as wse
  `);

  const [row] = result.rows;

  return {
    workoutExercises: row?.we ?? 0,
    workoutSessionExercises: row?.wse ?? 0,
  };
};

/** Counts what the User's rewrite would change, writing nothing and taking no lock. */
const countUser = async (
  tx: Transaction,
  userId: string,
  map: SlugMap
): Promise<UserRewrite> => {
  const counts = await countOld(tx, userId, map);

  const { drops, moves } = planRecords(
    await affectedRecords(tx, userId, map, false),
    map
  );

  return {
    ...counts,
    personalRecords: moves.length,
    personalRecordsDropped: drops.length,
    userId,
  };
};

/** Rewrites the User's rows in `tx`; one statement at a time (one connection). */
const rewriteUser = async (
  tx: Transaction,
  userId: string,
  map: SlugMap
): Promise<UserRewrite> => {
  // deleteUserData's order (USER_DATA_TABLES), so this queues behind an
  // account deletion instead of deadlocking with it, like the Plan and
  // Workout Session edits
  await tx.execute(sql`
    lock table ${plans}, ${workoutSessions}, ${workouts}, ${workoutExercises},
      ${workoutSessionExercises}, ${personalRecords}
    in row exclusive mode
  `);

  // Then finishWorkoutSession's order: the User's Personal record lock (so a
  // finish awarding records under an old slug commits before this reads
  // them, or waits for it), the Plan rows, the Workout Session rows; and
  // savePlan's below a Plan, Workouts then Workout Exercises, so neither
  // deadlocks with the updates below
  await lockPersonalRecordHistory(tx, userId);
  await tx.execute(sql`
    select ${plans.id} from ${plans}
      where ${plans.userId} = ${userId}
      order by ${plans.id}
      for no key update
  `);
  await tx.execute(sql`
    select ${workoutSessions.id} from ${workoutSessions}
      where ${workoutSessions.userId} = ${userId}
      order by ${workoutSessions.id}
      for no key update
  `);
  await tx.execute(sql`
    select ${workouts.id} from ${workouts}
      join ${plans} on ${plans.id} = ${workouts.planId}
      where ${plans.userId} = ${userId}
      order by ${workouts.id}
      for no key update of ${workouts}
  `);
  await tx.execute(sql`
    select ${workoutExercises.id} from ${workoutExercises}
      join ${workouts} on ${workouts.id} = ${workoutExercises.workoutId}
      join ${plans} on ${plans.id} = ${workouts.planId}
      where ${plans.userId} = ${userId}
        and ${workoutExercises.exerciseSlug} in ${oldSlugs(map)}
      order by ${workoutExercises.id}
      for no key update of ${workoutExercises}
  `);

  const rewrittenWorkoutExercises = await tx.execute(sql`
    update ${workoutExercises} set exercise_slug = m.value
      from ${mapRows(map)} as m, ${workouts}, ${plans}
      where ${workoutExercises.exerciseSlug} = m.key
        and ${workouts.id} = ${workoutExercises.workoutId}
        and ${plans.id} = ${workouts.planId}
        and ${plans.userId} = ${userId}
  `);

  // Open Workout Sessions included: they keep running on the new slug
  const rewrittenSessionExercises = await tx.execute(sql`
    update ${workoutSessionExercises} set exercise_slug = m.value
      from ${mapRows(map)} as m, ${workoutSessions}
      where ${workoutSessionExercises.exerciseSlug} = m.key
        and ${workoutSessions.id} = ${workoutSessionExercises.workoutSessionId}
        and ${workoutSessions.userId} = ${userId}
  `);

  const { drops, moves } = planRecords(
    await affectedRecords(tx, userId, map, true),
    map
  );

  // Drops first: (workout_session_id, exercise_slug) is unique, so a winner
  // can only move onto its slug once the record already there is gone
  if (drops.length > 0) {
    await tx.execute(sql`
      delete from ${personalRecords}
        where ${personalRecords.userId} = ${userId}
          and id in (select jsonb_array_elements_text(${JSON.stringify(drops)}::jsonb)::uuid)
    `);
  }

  if (moves.length > 0) {
    await tx.execute(sql`
      update ${personalRecords} set exercise_slug = m.value
        from ${mapRows(Object.fromEntries(moves.map((move) => [move.id, move.slug])))} as m
        where ${personalRecords.userId} = ${userId}
          and ${personalRecords.id} = m.key::uuid
    `);
  }

  return {
    personalRecords: moves.length,
    personalRecordsDropped: drops.length,
    userId,
    workoutExercises: rewrittenWorkoutExercises.rowCount ?? 0,
    workoutSessionExercises: rewrittenSessionExercises.rowCount ?? 0,
  };
};

const changed = (user: UserRewrite) =>
  user.workoutExercises +
  user.workoutSessionExercises +
  user.personalRecords +
  user.personalRecordsDropped;

/**
 * Rewrites every stored old Exercise slug to its replacement (ADR 0022): the
 * one-off run once no build reads the Legacy Library. `workout_exercises`,
 * `workout_session_exercises` (open Workout Sessions included) and
 * `personal_records`, one User per transaction through `withService`. Within
 * a Workout Session, Personal records landing on one slug keep the better one
 * (higher weight, then more reps) and drop the other; duplicate Workout
 * Exercise and Workout Session Exercise rows stay. A slug already new is left
 * alone, so a second run writes nothing. Users still holding an old slug
 * after a pass (written while their pass ran) get another, up to
 * `MAX_PASSES`, after which it throws.
 *
 * Throws `EmptySlugMapError`, before anything is read, for an empty map.
 */
export const rewriteExerciseSlugs = async ({
  dryRun = false,
  log = console.log,
  map,
  userIds,
}: RewriteOptions): Promise<RewriteReport> => {
  if (Object.keys(map).length === 0) {
    throw new EmptySlugMapError();
  }

  const report: RewriteReport = { users: [], written: 0 };

  /** Folds one User's result into the report (a later pass adds to an earlier one's). */
  const record = (result: UserRewrite) => {
    const earlier = report.users.find((user) => user.userId === result.userId);

    if (earlier) {
      earlier.personalRecords += result.personalRecords;
      earlier.personalRecordsDropped += result.personalRecordsDropped;
      earlier.workoutExercises += result.workoutExercises;
      earlier.workoutSessionExercises += result.workoutSessionExercises;
    } else {
      report.users.push(result);
    }

    if (!dryRun) {
      report.written += changed(result);
    }

    log(
      `user ${result.userId}: workout_exercises ${result.workoutExercises}, workout_session_exercises ${result.workoutSessionExercises}, personal_records ${result.personalRecords} (${result.personalRecordsDropped} dropped)${dryRun ? " to rewrite" : ""}`
    );
  };

  /** One User at a time keeps production load small. */
  const pass = async (users: string[]) => {
    let processing = Promise.resolve(0);

    for (const userId of users) {
      processing = processing.then(async (count) => {
        const result = await withService((tx) =>
          dryRun ? countUser(tx, userId, map) : rewriteUser(tx, userId, map)
        );

        if (changed(result) === 0) {
          return count;
        }

        record(result);

        return count + 1;
      });
    }

    await processing;
  };

  /**
   * Passes until no User holds an old slug: a row written under one while
   * its User's pass ran is rewritten by the next. A dry run counts once.
   */
  const passFrom = async (passNumber: number): Promise<void> => {
    const users = await withService((tx) => listUsers(tx, map, userIds));

    if (users.length === 0) {
      return;
    }

    if (passNumber > MAX_PASSES) {
      // Users kept writing old slugs while the rewrite ran (a Workout
      // Session started from a Plan just before its rewrite committed)
      throw new Error(
        `${users.length} Users still have old Exercise slugs after ${MAX_PASSES} passes; run the rewrite again`
      );
    }

    await pass(users);

    if (!dryRun) {
      await passFrom(passNumber + 1);
    }
  };

  await passFrom(1);

  const total = (key: Exclude<keyof UserRewrite, "userId">) =>
    report.users.reduce((sum, user) => sum + user[key], 0);

  log(
    `${dryRun ? "Dry run: would rewrite" : "Rewrote"} workout_exercises ${total("workoutExercises")}, workout_session_exercises ${total("workoutSessionExercises")}, personal_records ${total("personalRecords")} (${total("personalRecordsDropped")} dropped) for ${report.users.length} Users`
  );

  return report;
};
