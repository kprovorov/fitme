import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { getCurrentUserId } from "~/lib/clerk";

/**
 * Who started a write, and when: what a seeding mutation's own `onMutate`
 * answers, and its `onSuccess` (or the caller's `onSettled`) gets back as its
 * third argument. A hook-level `onMutate` would replace it, so none is passed.
 */
export interface WriteStarter {
  /** The write's place among every write started, the latest the highest. */
  order: number;
  /** When the write started (`Date.now()`), against a query's `dataUpdatedAt`. */
  startedAt: number;
  /** The Clerk User signed in when the write started, `null` for nobody. */
  userId: string | null;
}

/** The signed-in User's Clerk id, or `null` when nobody is. */
const signedInUserId = (): string | null => {
  try {
    return getCurrentUserId();
  } catch {
    return null;
  }
};

/** How many writes have started; each one's `order`. */
let writesStarted = 0;

/**
 * The `order` of the write whose answer each query shows, by query: a later
 * write's answer is newer even when both land within a millisecond, which
 * `dataUpdatedAt` can't tell apart.
 */
const seededBy = new WeakMap<object, number>();

/** A seeding mutation's `onMutate`: remembers who started the write, and when. */
export const rememberWriteStarter = (): WriteStarter => {
  writesStarted += 1;
  return {
    order: writesStarted,
    startedAt: Date.now(),
    userId: signedInUserId(),
  };
};

/**
 * Whether the User who started the write is still the one signed in: only
 * then may its answer, or anything done after it, touch the cache.
 */
export const isStillWriteStarter = (
  starter: WriteStarter | undefined
): boolean => !!starter?.userId && signedInUserId() === starter.userId;

/**
 * Puts a write's answer into the query at `queryKey`, so it shows without a
 * second read, and answers whether it did. Only for the User who started the
 * write: signing out clears the cache, not a write still waiting for its
 * answer, so seeding then would show the previous User's data to whoever
 * signs in next and cancel that User's own reads; for anyone else it touches
 * nothing. A read of the query still in flight was asked before the answer,
 * so it's cancelled first. And only while nothing newer has landed in the
 * query since the write started (a read landing after it, or the answer of a
 * write started after it): the answer may then be older than what's shown,
 * so the query is read again instead, which is always safe.
 */
export const seedWriteAnswer = async (
  client: QueryClient,
  starter: WriteStarter | undefined,
  queryKey: QueryKey,
  answer: unknown
): Promise<boolean> => {
  if (!(starter && isStillWriteStarter(starter))) {
    return false;
  }
  await client.cancelQueries({ exact: true, queryKey });
  // Signed out while cancelling: the query may already be the next User's.
  if (!isStillWriteStarter(starter)) {
    return false;
  }
  const cache = client.getQueryCache();
  const shown = cache.find({ exact: true, queryKey });
  const isNewerShown =
    // A read that landed after the write started…
    (shown?.state.dataUpdatedAt ?? 0) > starter.startedAt ||
    // …or the answer of a write started after this one.
    (shown ? (seededBy.get(shown) ?? 0) : 0) > starter.order;
  if (isNewerShown) {
    await client.invalidateQueries({ exact: true, queryKey });
    return false;
  }
  client.setQueryData(queryKey, answer);
  const seeded = cache.find({ exact: true, queryKey });
  if (seeded) {
    seededBy.set(seeded, starter.order);
  }
  return true;
};
