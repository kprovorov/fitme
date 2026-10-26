export interface ArnoldConversationDeps {
  /** The Arnold session ids recorded for the User. */
  listSessionIds: (userId: string) => Promise<string[]>;
  /** Retires one Arnold session; succeeds for one already gone. */
  resetSession: (sessionId: string) => Promise<void>;
}

// Resets in flight at once, so a User with many sessions doesn't flood Arnold
const RESET_BATCH_SIZE = 5;

/**
 * Wipes a deleted User's Arnold Conversations: resets every EVE session
 * recorded for them. The records stay as tombstones: eve keeps a reset
 * session's stream until retention ends, and a missing record would let the
 * first caller with the id claim it and read it, while one owned by the
 * retired id fails closed. Any failed reset throws (the first error as the
 * cause) so the webhook answers 500 and Clerk retries; resetting a session
 * again is harmless. A User with no recorded sessions needs no call to
 * Arnold at all.
 */
export const deleteArnoldConversations =
  ({ listSessionIds, resetSession }: ArnoldConversationDeps) =>
  async (userId: string): Promise<void> => {
    const sessionIds = await listSessionIds(userId);
    const failures: unknown[] = [];
    for (let start = 0; start < sessionIds.length; start += RESET_BATCH_SIZE) {
      const batch = sessionIds.slice(start, start + RESET_BATCH_SIZE);
      // biome-ignore lint/performance/noAwaitInLoops: batches of five so a User with many sessions doesn't flood Arnold
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
        `Failed to reset ${failures.length} of ${sessionIds.length} Arnold sessions`,
        { cause: failures[0] }
      );
    }
  };

interface ArnoldSessionResetterOptions {
  /** Arnold's base URL (`ARNOLD_URL`). */
  arnoldUrl: string | undefined;
  fetch?: typeof fetch;
  /** Arnold's `ARNOLD_RESET_SECRET`. */
  secret: string | undefined;
}

/**
 * Arnold's URL and reset secret from `env`: `ARNOLD_URL` and
 * `ARNOLD_RESET_SECRET`.
 */
export const arnoldResetConfig = (
  env: Record<string, string | undefined>
): Pick<ArnoldSessionResetterOptions, "arnoldUrl" | "secret"> => ({
  arnoldUrl: env.ARNOLD_URL,
  secret: env.ARNOLD_RESET_SECRET,
});

const RESET_TIMEOUT_MS = 20_000;

/**
 * Whether `body` is eve's success answer for resetting `sessionId`:
 * `{ ok: true, status: "reset", previousSessionId: sessionId }` or
 * `{ ok: true, status: "no_active_session" }`. Anything else (a proxy, a
 * misrouted ARNOLD_URL) leaves the session possibly live.
 */
const isResetDone = (body: unknown, sessionId: string): boolean => {
  if (!body || typeof body !== "object") {
    return false;
  }
  const answer = body as Record<string, unknown>;
  if (answer.ok !== true) {
    return false;
  }
  return answer.status === "reset"
    ? answer.previousSessionId === sessionId
    : answer.status === "no_active_session";
};

/**
 * Resets one Arnold session through Arnold's eve channel
 * (`POST /eve/v1/session/:id/reset`), authenticated with the reset secret.
 * An unknown, already reset or expired session answers `no_active_session`,
 * which counts as done.
 */
export const arnoldSessionResetter =
  ({
    arnoldUrl,
    fetch = globalThis.fetch,
    secret,
  }: ArnoldSessionResetterOptions) =>
  async (sessionId: string): Promise<void> => {
    if (!arnoldUrl) {
      throw new Error("Missing ARNOLD_URL environment variable");
    }
    if (!secret) {
      throw new Error("Missing ARNOLD_RESET_SECRET environment variable");
    }
    const url = new URL(
      `eve/v1/session/${encodeURIComponent(sessionId)}/reset`,
      arnoldUrl.endsWith("/") ? arnoldUrl : `${arnoldUrl}/`
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
    if (!(response.ok && isResetDone(body, sessionId))) {
      throw new Error(
        `Arnold session ${sessionId} reset failed: HTTP ${response.status} ${JSON.stringify(body)}`
      );
    }
  };
