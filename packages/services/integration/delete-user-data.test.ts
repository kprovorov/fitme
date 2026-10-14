import { randomUUID } from "node:crypto";
import {
  asUser,
  conversations,
  exercises,
  messages,
  plans,
  profiles,
  retiredUserIdsInPrivate,
  type Transaction,
  withService,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteUserData, UserRekeyedError } from "../src/delete-user-data";

/**
 * deleteUserData through withService, against a local Supabase stack via the
 * Supavisor pooler as the fitme login. Made-up Clerk-style User ids, unique
 * per run.
 */

const runId = randomUUID().replaceAll("-", "").slice(0, 12);
const deleted = `user_svcDel${runId}`;
const bystander = `user_svcKeep${runId}`;
const legacy = `user_svcLegacy${runId}`;
const rekeyed = `user_svcRekeyed${runId}`;
const chainA = `user_svcChainA${runId}`;
const chainB = `user_svcChainB${runId}`;
const chainC = `user_svcChainC${runId}`;

// insufficient_privilege: the reject_retired_user_id trigger, or RLS
const REFUSED = "42501";

interface OwnedRows {
  conversation: string;
  message: string;
  plan: string;
  profile: string;
  session: string;
  sessionExercise: string;
  sessionSet: string;
  workout: string;
  workoutExercise: string;
  workoutSet: string;
}

let exerciseId: string;

/** One row in every User-owned table and child table, all linked. */
const seedUser = (userId: string): Promise<OwnedRows> =>
  withService(async (tx) => {
    const [profile] = await tx
      .insert(profiles)
      .values({ age: 30, gender: "male", height: "180", userId, weight: "80" })
      .returning({ id: profiles.id });
    const [plan] = await tx
      .insert(plans)
      .values({ frequency: 3, goal: "general", place: "gym", userId })
      .returning({ id: plans.id });
    const [workout] = await tx
      .insert(workouts)
      .values({
        description: "Day 1",
        name: "Day 1",
        order: 1,
        planId: plan.id,
      })
      .returning({ id: workouts.id });
    const [workoutExercise] = await tx
      .insert(workoutExercises)
      .values({ exerciseId, order: 1, workoutId: workout.id })
      .returning({ id: workoutExercises.id });
    const [workoutSet] = await tx
      .insert(workoutExerciseSets)
      .values({
        order: 1,
        repsRecommended: 10,
        restRecommended: 60,
        weightRecommended: "20",
        workoutExerciseId: workoutExercise.id,
      })
      .returning({ id: workoutExerciseSets.id });
    const [session] = await tx
      .insert(workoutSessions)
      .values({
        planId: plan.id,
        startedAt: new Date().toISOString(),
        userId,
        workoutId: workout.id,
      })
      .returning({ id: workoutSessions.id });
    const [sessionExercise] = await tx
      .insert(workoutSessionExercises)
      .values({ exerciseId, order: 1, workoutSessionId: session.id })
      .returning({ id: workoutSessionExercises.id });
    const [sessionSet] = await tx
      .insert(workoutSessionExerciseSets)
      .values({ order: 1, workoutSessionExerciseId: sessionExercise.id })
      .returning({ id: workoutSessionExerciseSets.id });
    const [conversation] = await tx
      .insert(conversations)
      .values({ userId })
      .returning({ id: conversations.id });
    const [message] = await tx
      .insert(messages)
      .values({ content: "Hi", conversationId: conversation.id, role: "user" })
      .returning({ id: messages.id });

    return {
      conversation: conversation.id,
      message: message.id,
      plan: plan.id,
      profile: profile.id,
      session: session.id,
      sessionExercise: sessionExercise.id,
      sessionSet: sessionSet.id,
      workout: workout.id,
      workoutExercise: workoutExercise.id,
      workoutSet: workoutSet.id,
    };
  });

const count = async (
  tx: Transaction,
  table:
    | typeof conversations
    | typeof messages
    | typeof plans
    | typeof profiles
    | typeof workoutExerciseSets
    | typeof workoutExercises
    | typeof workoutSessionExerciseSets
    | typeof workoutSessionExercises
    | typeof workoutSessions
    | typeof workouts,
  id: string
) => tx.$count(table, eq(table.id, id));

/** How many of the seeded rows still exist, per table. */
const remaining = (rows: OwnedRows) =>
  withService(async (tx) => ({
    conversation: await count(tx, conversations, rows.conversation),
    message: await count(tx, messages, rows.message),
    plan: await count(tx, plans, rows.plan),
    profile: await count(tx, profiles, rows.profile),
    session: await count(tx, workoutSessions, rows.session),
    sessionExercise: await count(
      tx,
      workoutSessionExercises,
      rows.sessionExercise
    ),
    sessionSet: await count(tx, workoutSessionExerciseSets, rows.sessionSet),
    workout: await count(tx, workouts, rows.workout),
    workoutExercise: await count(tx, workoutExercises, rows.workoutExercise),
    workoutSet: await count(tx, workoutExerciseSets, rows.workoutSet),
  }));

const allRows = (present: 0 | 1) => ({
  conversation: present,
  message: present,
  plan: present,
  profile: present,
  session: present,
  sessionExercise: present,
  sessionSet: present,
  workout: present,
  workoutExercise: present,
  workoutSet: present,
});

const retirement = (userId: string) =>
  withService((tx) =>
    tx
      .select()
      .from(retiredUserIdsInPrivate)
      .where(eq(retiredUserIdsInPrivate.userId, userId))
  );

let deletedRows: OwnedRows;
let bystanderRows: OwnedRows;

beforeAll(async () => {
  const [exercise] = await withService((tx) =>
    tx
      .insert(exercises)
      .values({ name: "Test squat", slug: `test-squat-${runId}` })
      .returning({ id: exercises.id })
  );
  exerciseId = exercise.id;
  deletedRows = await seedUser(deleted);
  bystanderRows = await seedUser(bystander);
});

afterAll(async () => {
  await withService(async (tx) => {
    await deleteUserData(tx, bystander);
    await deleteUserData(tx, rekeyed);
    await tx.delete(exercises).where(eq(exercises.id, exerciseId));
  });
});

describe("deleteUserData", () => {
  it("removes every row the User owns, children included", async () => {
    expect(await remaining(deletedRows)).toEqual(allRows(1));

    await withService((tx) => deleteUserData(tx, deleted));

    expect(await remaining(deletedRows)).toEqual(allRows(0));
  });

  it("leaves another User's rows untouched", async () => {
    expect(await remaining(bystanderRows)).toEqual(allRows(1));
  });

  it("retires the id, so a later write as that User is refused", async () => {
    expect(await retirement(deleted)).toEqual([
      expect.objectContaining({ rekeyedTo: null, userId: deleted }),
    ]);

    await expect(
      asUser(deleted, (tx) =>
        tx.insert(conversations).values({ userId: deleted })
      )
    ).rejects.toMatchObject({
      // Drizzle wraps the Postgres error
      cause: { code: REFUSED },
    });
  });

  it("is a no-op when run again for the same User", async () => {
    const before = await retirement(deleted);

    await withService((tx) => deleteUserData(tx, deleted));

    expect(await retirement(deleted)).toEqual(before);
    expect(await remaining(deletedRows)).toEqual(allRows(0));
    expect(await remaining(bystanderRows)).toEqual(allRows(1));
  });

  it("refuses an id that was rekeyed away, changing nothing", async () => {
    const legacyRows = await seedUser(legacy);
    await withService((tx) =>
      tx.execute(sql`select public.rekey_user(${legacy}, ${rekeyed})`)
    );

    const attempt = withService((tx) => deleteUserData(tx, legacy));

    await expect(attempt).rejects.toBeInstanceOf(UserRekeyedError);
    await expect(attempt).rejects.toMatchObject({
      code: "55000",
      userId: legacy,
    });
    expect(await retirement(legacy)).toEqual([
      expect.objectContaining({ rekeyedTo: rekeyed, userId: legacy }),
    ]);
    expect(await remaining(legacyRows)).toEqual(allRows(1));
    expect(
      await withService((tx) =>
        tx
          .select({ userId: profiles.userId })
          .from(profiles)
          .where(eq(profiles.id, legacyRows.profile))
      )
    ).toEqual([{ userId: rekeyed }]);
  });

  it("refuses every id along a rekey chain and deletes its current id", async () => {
    const chainRows = await seedUser(chainA);
    await withService(async (tx) => {
      await tx.execute(sql`select public.rekey_user(${chainA}, ${chainB})`);
      await tx.execute(sql`select public.rekey_user(${chainB}, ${chainC})`);
    });

    await expect(
      withService((tx) => deleteUserData(tx, chainA))
    ).rejects.toMatchObject({ code: "55000", userId: chainA });
    await expect(
      withService((tx) => deleteUserData(tx, chainB))
    ).rejects.toMatchObject({ code: "55000", userId: chainB });
    expect(await remaining(chainRows)).toEqual(allRows(1));

    await withService((tx) => deleteUserData(tx, chainC));

    expect(await remaining(chainRows)).toEqual(allRows(0));
    expect(await remaining(bystanderRows)).toEqual(allRows(1));
  });

  it("rejects an empty id", async () => {
    await expect(withService((tx) => deleteUserData(tx, ""))).rejects.toThrow(
      "deleteUserData needs a User id"
    );
  });
});
