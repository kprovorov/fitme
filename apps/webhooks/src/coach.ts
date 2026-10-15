export interface CoachConversationDeps {
  /** The Coach session ids recorded for the User. */
  listSessionIds: (userId: string) => Promise<string[]>;
  /** Retires one Coach session; succeeds for one already gone. */
  resetSession: (sessionId: string) => Promise<void>;
}

// Resets in flight at once, so a User with many sessions doesn't flood the Coach
const RESET_BATCH_SIZE = 5;

/**
 * Wipes a deleted User's Coach Conversations: resets every EVE session
 * recorded for them. The records stay as tombstones: eve keeps a reset
 * session's stream until retention ends, and a missing record would let the
 * first caller with the id claim it and read it, while one owned by the
 * retired id fails closed. Any failed reset throws (the first error as the
 * cause) so the webhook answers 500 and Clerk retries; resetting a session
 * again is harmless. A User with no recorded sessions needs no Coach at all.
 */
export const deleteCoachConversations =
  ({ listSessionIds, resetSession }: CoachConversationDeps) =>
  async (userId: string): Promise<void> => {
    const sessionIds = await listSessionIds(userId);
    const failures: unknown[] = [];
    for (let start = 0; start < sessionIds.length; start += RESET_BATCH_SIZE) {
      const batch = sessionIds.slice(start, start + RESET_BATCH_SIZE);
      // biome-ignore lint/performance/noAwaitInLoops: batches of five so a User with many sessions doesn't flood the Coach
      const results = await Promise.allSettled(batch.map(resetSession));
      for (const result of results) {
        if (result.status === "rejected") {
          failures.push(result.reason);
        }
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Failed to reset ${failures.length} of ${sessionIds.length} Coach sessions`,
        { cause: failures[0] }
      );
    }
  };

interface CoachSessionResetterOptions {
  /** The Coach's base URL (`COACH_URL`). */
  coachUrl: string | undefined;
  fetch?: typeof fetch;
  /** The Coach's `COACH_RESET_SECRET`. */
  secret: string | undefined;
}

const RESET_TIMEOUT_MS = 20_000;

// eve's reset statuses; anything else isn't the Coach answering
const RESET_DONE = new Set<unknown>(["reset", "no_active_session"]);

/**
 * Resets one Coach session through the Coach's eve channel
 * (`POST /eve/v1/session/:id/reset`), authenticated with the reset secret.
 * An unknown, already reset or expired session answers `no_active_session`,
 * which counts as done.
 */
export const coachSessionResetter =
  ({
    coachUrl,
    fetch = globalThis.fetch,
    secret,
  }: CoachSessionResetterOptions) =>
  async (sessionId: string): Promise<void> => {
    if (!coachUrl) {
      throw new Error("Missing COACH_URL environment variable");
    }
    if (!secret) {
      throw new Error("Missing COACH_RESET_SECRET environment variable");
    }
    const url = new URL(
      `eve/v1/session/${encodeURIComponent(sessionId)}/reset`,
      coachUrl.endsWith("/") ? coachUrl : `${coachUrl}/`
    );
    const response = await fetch(url, {
      body: JSON.stringify({ reason: "Account deleted" }),
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(RESET_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    const status =
      body && typeof body === "object" && "status" in body
        ? body.status
        : undefined;
    if (!(response.ok && RESET_DONE.has(status))) {
      throw new Error(
        `Coach session ${sessionId} reset failed: HTTP ${response.status} ${JSON.stringify(body)}`
      );
    }
  };
