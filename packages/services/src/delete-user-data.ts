import {
  arnoldSessions,
  plans,
  profiles,
  retiredUserIdsInPrivate,
  type Transaction,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { and, eq, isNotNull, sql } from "drizzle-orm";

/**
 * The User-owned tables: the roots, their children, then arnold_sessions. The
 * Plan edits in workout-edits.ts take their locks in this order too, so they
 * queue behind an account deletion instead of deadlocking. Every table that holds a
 * User's rows must be here: a schema change that adds one has to add it, and
 * the integration test catches a miss.
 */
const LOCKED_TABLES = sql.join(
  [
    profiles,
    plans,
    workoutSessions,
    workouts,
    workoutExercises,
    workoutExerciseSets,
    workoutSessionExercises,
    workoutSessionExerciseSets,
    arnoldSessions,
  ],
  sql`, `
);

/** SQLSTATE 55000 (object_not_in_prerequisite_state), as the dropped delete_user_data raised. */
const REKEYED_CODE = "55000";

/**
 * The id was rekeyed to another one (the one-shot Supabase -> Clerk
 * migration; production keeps its retired ids), so its rows now belong to the
 * new id. Deleting it would leave that account behind; delete the new id
 * instead.
 */
export class UserRekeyedError extends Error {
  readonly code = REKEYED_CODE;
  readonly userId: string;

  constructor(userId: string) {
    super(`User ${userId} was rekeyed`);
    this.name = "UserRekeyedError";
    this.userId = userId;
  }
}

/**
 * Retires `userId` and deletes every row the User owns, in `tx` (from
 * `withService`), as the dropped delete_user_data SQL function did.
 * Retiring the id makes `current_user_id()` NULL for it and the
 * reject_retired_user_id triggers refuse writes under it, so a still-valid
 * token can't write the data back. Running it again for the same User is a
 * no-op.
 *
 * `userId` must come from a verified source (a signed webhook), never from
 * request input.
 */
export const deleteUserData = async (
  tx: Transaction,
  userId: string
): Promise<void> => {
  if (!userId) {
    throw new Error("deleteUserData needs a User id");
  }

  // Block writes until the transaction ends, so requests in flight finish
  // first and nothing is written under the id after it is retired
  await tx.execute(
    sql`lock table ${LOCKED_TABLES} in share row exclusive mode`
  );

  // Checked after the lock, so a rekey that committed first is seen
  const [rekeyed] = await tx
    .select({ userId: retiredUserIdsInPrivate.userId })
    .from(retiredUserIdsInPrivate)
    .where(
      and(
        eq(retiredUserIdsInPrivate.userId, userId),
        isNotNull(retiredUserIdsInPrivate.rekeyedTo)
      )
    );
  if (rekeyed) {
    throw new UserRekeyedError(userId);
  }

  await tx
    .insert(retiredUserIdsInPrivate)
    .values({ userId })
    .onConflictDoNothing();

  // Root rows only; their children go through the foreign key cascades
  await tx.delete(workoutSessions).where(eq(workoutSessions.userId, userId));
  await tx.delete(plans).where(eq(plans.userId, userId));
  await tx.delete(profiles).where(eq(profiles.userId, userId));
  // arnold_sessions stays: each row is the ACL for an EVE session, whose
  // stream eve keeps until retention ends even after the webhook resets it,
  // and without the row Arnold's channel would let the first caller with the
  // id claim it. It holds only the (already retired) id and the session id.
};
