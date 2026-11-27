import { retiredUserIdsInPrivate, withService } from "@fitme/db";
import type { Transaction } from "@fitme/db";
import { sanitizeError } from "@fitme/observability";
import { asc, isNotNull } from "drizzle-orm";

/**
 * The one-off identity merge in PostHog (project "Product analytics on
 * PostHog"): a User who joined before the move to Clerk (ADR 0001) has their
 * old Supabase UUID in the analytics history beside their User id. Postgres
 * kept the map in `private.retired_user_ids` (a row with `rekeyed_to`), and
 * PostHog folds the UUID person into the User-id person through one
 * `$merge_dangerously` event per pair. A merge can't be undone. See README,
 * Identity merge.
 */

/** One old Supabase UUID and the User id it became. */
export interface IdentityPair {
  oldId: string;
  userId: string;
}

/** PostHog's US ingestion endpoint for a single event. */
export const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";

/**
 * Every rekeyed id and the User id it became, by old id. Read-only, no lock:
 * the Clerk migration that wrote them is over, so nothing writes them again.
 */
export const listIdentityPairs = async (
  tx: Transaction
): Promise<IdentityPair[]> => {
  const rows = await tx
    .select({
      oldId: retiredUserIdsInPrivate.userId,
      userId: retiredUserIdsInPrivate.rekeyedTo,
    })
    .from(retiredUserIdsInPrivate)
    .where(isNotNull(retiredUserIdsInPrivate.rekeyedTo))
    .orderBy(asc(retiredUserIdsInPrivate.userId));

  return rows.flatMap(({ oldId, userId }) =>
    userId === null ? [] : [{ oldId, userId }]
  );
};

/** The real reader: the map through `withService`, one read-only transaction. */
export const readIdentityPairs = (): Promise<IdentityPair[]> =>
  withService((tx) => listIdentityPairs(tx));

/**
 * The run stopped before sending anything: the map isn't one-to-one (merging
 * it would fold two people into one), or an old id asked for with `--only`
 * isn't in it.
 */
export class IdentityMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityMapError";
  }
}

/** Each id that appears more than once on its side of the map. */
export const mapProblems = (pairs: readonly IdentityPair[]): string[] => {
  const repeats = (side: "oldId" | "userId") => {
    const counts = new Map<string, number>();

    for (const pair of pairs) {
      counts.set(pair[side], (counts.get(pair[side]) ?? 0) + 1);
    }

    return [...counts].filter(([, count]) => count > 1);
  };

  return [
    ...repeats("oldId").map(
      ([id, count]) => `old id ${id} appears ${count} times`
    ),
    ...repeats("userId").map(
      ([id, count]) => `User id ${id} appears ${count} times`
    ),
  ];
};

export interface MergeIdentitiesOptions {
  /** Print the pairs and their count, send nothing. */
  dryRun?: boolean;
  /** One line per pair and a total: ids and counts only. */
  log?: (line: string) => void;
  /** Only these old ids (a handful first, or a retry); every pair by default. */
  only?: readonly string[];
  readPairs: () => Promise<IdentityPair[]>;
  /** Sends one merge; a rejection is that pair's failure. */
  sendMerge: (pair: IdentityPair) => Promise<void>;
}

export interface MergeIdentitiesReport {
  failed: IdentityPair[];
  /** The pairs merged, or on a dry run the ones that would be. */
  pairs: IdentityPair[];
  sent: number;
}

/** A send's failure, with no SQL, parameter or Postgres message. */
const failureMessage = (error: unknown): string => {
  const clean = sanitizeError(error).error;

  return clean instanceof Error ? clean.message : "unknown failure";
};

const describePair = ({ oldId, userId }: IdentityPair) =>
  `${oldId} -> ${userId}`;

/**
 * Reads the map, checks it's one-to-one (the whole map, even with `only`),
 * picks the asked-for pairs and sends one merge each, one after another. A
 * failed send is logged with its pair and the rest still go; the caller exits
 * 1 when `failed` isn't empty.
 */
export const mergeIdentities = async ({
  dryRun = false,
  log = console.log,
  only,
  readPairs,
  sendMerge,
}: MergeIdentitiesOptions): Promise<MergeIdentitiesReport> => {
  const all = await readPairs();
  const problems = mapProblems(all);

  if (problems.length > 0) {
    throw new IdentityMapError(
      `The id map isn't one-to-one, nothing sent:\n${problems.join("\n")}`
    );
  }

  let pairs = all;

  if (only !== undefined) {
    const asked = [...new Set(only)];
    const byOldId = new Map(all.map((pair) => [pair.oldId, pair]));
    const unknown = asked.filter((id) => !byOldId.has(id));

    if (unknown.length > 0) {
      throw new IdentityMapError(
        `Not in the id map, nothing sent: ${unknown.join(", ")}`
      );
    }

    pairs = asked.flatMap((id) => {
      const pair = byOldId.get(id);

      return pair ? [pair] : [];
    });
  }

  if (dryRun) {
    for (const pair of pairs) {
      log(`would merge ${describePair(pair)}`);
    }

    log(`${pairs.length} pairs to merge (dry run, nothing sent)`);

    return { failed: [], pairs, sent: 0 };
  }

  const failed: IdentityPair[] = [];
  let sent = 0;

  for (const pair of pairs) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- one at a time on purpose: 158 pairs need no concurrency, and each failure stays next to its pair
      await sendMerge(pair);
      sent += 1;
      log(`merged ${describePair(pair)}`);
    } catch (error) {
      failed.push(pair);
      log(`failed ${describePair(pair)}: ${failureMessage(error)}`);
    }
  }

  log(`${sent} merged, ${failed.length} failed, of ${pairs.length} pairs`);

  return { failed, pairs, sent };
};

export interface PostHogMergeOptions {
  /** The project API key (public by design). */
  apiKey: string;
  fetch?: typeof fetch;
  url?: string;
}

/**
 * The real sender: one `$merge_dangerously` event, sent as the surviving
 * person (the User id) with the person to fold in (the old id) as its
 * `alias`, PostHog's documented shape ("How to merge users").
 */
export const postHogMerge =
  ({
    apiKey,
    fetch: send = fetch,
    url = POSTHOG_CAPTURE_URL,
  }: PostHogMergeOptions) =>
  async ({ oldId, userId }: IdentityPair): Promise<void> => {
    const response = await send(url, {
      body: JSON.stringify({
        api_key: apiKey,
        distinct_id: userId,
        event: "$merge_dangerously",
        properties: { alias: oldId },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`PostHog answered ${response.status}`);
    }
  };

/** Why the command won't run here, or `null` when it may. */
export const runRefusal = ({
  apiKey,
  notProduction,
  vercelEnv,
}: {
  apiKey: string | undefined;
  notProduction: boolean;
  vercelEnv: string | undefined;
}): string | null => {
  if (apiKey === undefined || apiKey === "") {
    return "Set POSTHOG_PROJECT_API_KEY (the US project's API key)";
  }

  // A local stack's rows merged into the real project would stay merged
  if (vercelEnv !== "production" && !notProduction) {
    return "Set VERCEL_ENV=production with production's FITME_DATABASE_URL, or pass --not-production to run against other data on purpose";
  }

  return null;
};
