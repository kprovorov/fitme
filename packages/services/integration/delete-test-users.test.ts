import { randomBytes } from "node:crypto";
import {
  plans,
  profiles,
  withService,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { deleteTestUsers } from "./delete-test-users";

/**
 * The cleanup every integration file runs, racing another file's write that
 * takes its table locks out of deleteUserData's order (as fixture inserts do):
 * the cleanup waits for no lock while holding one, so neither side hits a
 * deadlock.
 */
const user = `user_apiCleanup${randomBytes(16).toString("hex")}`;
/** Long enough for a cleanup waiting on `workouts` to have queued there. */
const CLEANUP_HEAD_START_MS = 200;

describe("deleteTestUsers against the local stack", () => {
  it("lets a write holding a later table take an earlier one, then deletes", async () => {
    await withService(async (tx) => {
      await tx.insert(profiles).values({
        age: 30,
        gender: "male",
        height: "180",
        measurementSystem: "metric",
        userId: user,
        weight: "80",
      });
      await tx.insert(plans).values({
        frequency: 3,
        goal: "general",
        name: "Cleanup plan",
        place: "gym",
        userId: user,
      });
    });

    let cleanup: Promise<void> | undefined;
    try {
      await withService(async (tx) => {
        // A later table of deleteUserData's list first...
        await tx.execute(sql`lock table ${workouts} in row exclusive mode`);
        cleanup = deleteTestUsers([user]);
        await new Promise((resolve) =>
          setTimeout(resolve, CLEANUP_HEAD_START_MS)
        );
        // ...then an earlier one, which a cleanup waiting on workouts would
        // already hold.
        await tx.execute(
          sql`lock table ${workoutSessions} in row exclusive mode`
        );
      });
    } finally {
      await cleanup;
    }

    const [profilesLeft, plansLeft] = await withService(async (tx) => [
      await tx.select().from(profiles).where(eq(profiles.userId, user)),
      await tx.select().from(plans).where(eq(plans.userId, user)),
    ]);
    expect(profilesLeft).toEqual([]);
    expect(plansLeft).toEqual([]);
  });
});
