import { hashKey } from "@tanstack/react-query";
import type {
  InvalidateQueryFilters,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";

import { getCurrentUserId } from "~/lib/clerk";

/**
 * Who started a write, and what the query its answer goes into showed then:
 * what a seeding mutation's own `onMutate` answers, and its `onSuccess` (or
 * the caller's `onSettled`) gets back as its third argument. A hook-level
 * `onMutate` would replace it, so none is passed.
 */
export interface WriteStarter {
  /**
   * Each query the write will seed, by its hash, as it was when the write
   * started: its data, kept by reference, and its `dataUpdateCount`. Each
   * covers what the other can't. Data put into the query since is another
   * object unless it's deep-equal (react-query's structural sharing keeps the
   * reference then), but even a deep-equal read bumps the count. A reset or a
   * query recreated after a sign-out starts the count over, but it loses the
   * data, and anything loaded into it after is another object.
   */
  shownAtStart: Record<string, { count: number; data: unknown }>;
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

/** A query's data, by reference, and how many times data was put into it. */
const shownIn = (client: QueryClient, queryKey: QueryKey) => ({
  count: client.getQueryState(queryKey)?.dataUpdateCount ?? 0,
  data: client.getQueryData(queryKey),
});

/**
 * A seeding mutation's `onMutate`: remembers who started the write, and what
 * each query (`queryKeys`) its answer will go into showed. A query the write
 * creates (a new Plan's) shows nothing yet (`undefined`, a count of 0).
 */
export const rememberWriteStarter = (
  client: QueryClient,
  queryKeys: QueryKey[]
): WriteStarter => ({
  shownAtStart: Object.fromEntries(
    queryKeys.map((queryKey) => [hashKey(queryKey), shownIn(client, queryKey)])
  ),
  userId: signedInUserId(),
});

/**
 * Whether the User who started the write is still the one signed in: only
 * then may its answer, or anything done after it, touch the cache.
 */
export const isStillWriteStarter = (
  starter: WriteStarter | undefined
): boolean => !!starter?.userId && signedInUserId() === starter.userId;

/**
 * What became of a write's answer: shown as is (`seeded`), read again since
 * something newer had landed in its query (`superseded`), or left alone since
 * another User signed in meanwhile (`signed-out`).
 */
export type SeedResult = "seeded" | "superseded" | "signed-out";

/**
 * Puts a write's answer into the query at `queryKey`, so it shows without a
 * second read, then invalidates `alsoInvalidate` (what else the write
 * changed). The signed-in User is checked before each step and after every
 * await: signing out clears the cache, not a write still waiting for its
 * answer, so a write started by another User touches nothing. A read of the
 * query still in flight was asked before the answer and is cancelled (which
 * puts back the data it would have replaced). The answer is only shown while
 * the query still shows the very data it showed when the write started, with
 * nothing put into it since (the same reference and the same count): anything
 * else (a read, even of deep-equal data, or another write's answer that
 * landed since, or no data after a sign-out or a reset) may be newer than the
 * answer, so the query is read again instead, which is always safe.
 */
export const seedWriteAnswer = async (
  client: QueryClient,
  starter: WriteStarter | undefined,
  {
    alsoInvalidate = [],
    answer,
    queryKey,
  }: {
    alsoInvalidate?: InvalidateQueryFilters[];
    answer: unknown;
    queryKey: QueryKey;
  }
): Promise<SeedResult> => {
  if (!isStillWriteStarter(starter)) {
    return "signed-out";
  }

  await client.cancelQueries({ exact: true, queryKey });

  if (!(starter && isStillWriteStarter(starter))) {
    return "signed-out";
  }

  let result: SeedResult = "seeded";
  const now = shownIn(client, queryKey);

  const atStart = starter.shownAtStart[hashKey(queryKey)] ?? {
    count: 0,
    data: undefined,
  };

  if (now.data === atStart.data && now.count === atStart.count) {
    client.setQueryData(queryKey, answer);
  } else {
    result = "superseded";
    await client.invalidateQueries({ exact: true, queryKey });

    if (!isStillWriteStarter(starter)) {
      return "signed-out";
    }
  }

  await Promise.all(
    alsoInvalidate.map((filters) => client.invalidateQueries(filters))
  );

  return isStillWriteStarter(starter) ? result : "signed-out";
};
