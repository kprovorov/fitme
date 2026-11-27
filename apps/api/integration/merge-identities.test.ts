import { randomBytes, randomUUID } from "node:crypto";

import { retiredUserIdsInPrivate, withService } from "@fitme/db";
import { describe, expect, it } from "vitest";

import { listIdentityPairs } from "../src/merge-identities.js";
import type { IdentityPair } from "../src/merge-identities.js";

/**
 * Reading the identity map from the local stack. A retired id is never
 * deleted (service_role may only read and insert them), so every row this
 * file writes is rolled back with the transaction that reads it, and only
 * this file's rows are asserted on: other files retire ids at once.
 */

class RollbackError extends Error {
  constructor() {
    super("rolled back");
    this.name = "RollbackError";
  }
}

/** Runs `fn` in a `withService` transaction that's always rolled back. */
const inRolledBackTransaction = async <T>(
  fn: Parameters<typeof withService<T>>[0]
): Promise<T> => {
  let result: T | undefined;

  await expect(
    withService(async (tx) => {
      result = await fn(tx);
      throw new RollbackError();
    })
  ).rejects.toThrow(RollbackError);

  return result as T;
};

const testUserId = () => `user_merge${randomBytes(16).toString("hex")}`;

describe(listIdentityPairs, () => {
  it("answers each rekeyed id with its User id, and no plain retired id", async () => {
    const rekeyed: IdentityPair[] = [
      { oldId: randomUUID(), userId: testUserId() },
      { oldId: randomUUID(), userId: testUserId() },
    ];

    const deleted = testUserId();

    const pairs = await inRolledBackTransaction(async (tx) => {
      await tx.insert(retiredUserIdsInPrivate).values([
        ...rekeyed.map(({ oldId, userId }) => ({
          rekeyedTo: userId,
          userId: oldId,
        })),
        // An account deletion's retired id: no rekeyed_to, never merged
        { userId: deleted },
      ]);

      return await listIdentityPairs(tx);
    });

    const ours = new Set([...rekeyed.map((pair) => pair.oldId), deleted]);

    expect(
      pairs
        .filter((pair) => ours.has(pair.oldId))
        .toSorted((a, b) => a.oldId.localeCompare(b.oldId))
    ).toStrictEqual(rekeyed.toSorted((a, b) => a.oldId.localeCompare(b.oldId)));
  });

  it("leaves nothing behind", async () => {
    const oldId = randomUUID();

    await inRolledBackTransaction(async (tx) => {
      await tx
        .insert(retiredUserIdsInPrivate)
        .values({ rekeyedTo: testUserId(), userId: oldId });
    });

    const pairs = await withService((tx) => listIdentityPairs(tx));

    expect(pairs.some((pair) => pair.oldId === oldId)).toBeFalsy();
  });
});
