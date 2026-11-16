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

    const resetBatch = async (start: number): Promise<void> => {
      if (start >= sessionIds.length) {
        return;
      }

      const batch = sessionIds.slice(start, start + RESET_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(resetSession));

      for (const result of results) {
        if (result.status === "rejected") {
          failures.push(result.reason);
        }
      }

      await resetBatch(start + RESET_BATCH_SIZE);
    };

    await resetBatch(0);

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

type Eve083ResetAnswer =
  | { ok: true; status: "reset"; previousSessionId: string }
  | { ok: true; status: "no_active_session" };

const isEve083ResetAnswer = (body: unknown): body is Eve083ResetAnswer =>
  body !== null &&
  typeof body === "object" &&
  "ok" in body &&
  body.ok === true &&
  "status" in body &&
  (body.status === "no_active_session" ||
    (body.status === "reset" &&
      "previousSessionId" in body &&
      typeof body.previousSessionId === "string"));

/**
 * Whether a 200 `body` is eve 0.83's success answer for resetting
 * `sessionId`: `{ ok: true, status: "reset", previousSessionId: sessionId }`
 * or `{ ok: true, status: "no_active_session" }`.
 */
const isEve083ResetDone = (body: unknown, sessionId: string): boolean =>
  isEve083ResetAnswer(body) &&
  (body.status === "reset"
    ? body.previousSessionId === sessionId
    : body.status === "no_active_session");

const ACCEPTED = 202;
const CONFLICT = 409;

/** eve 1.0's 202 answer: the session ended. */
const isEve1EndedAnswer = (body: unknown): body is { ok: true } =>
  body !== null && typeof body === "object" && "ok" in body && body.ok === true;

/** eve 1.0's 409 answer for a session already ended, expired or unknown. */
const isEve1NotActiveAnswer = (
  body: unknown
): body is { code: "session_not_active" } =>
  body !== null &&
  typeof body === "object" &&
  "code" in body &&
  body.code === "session_not_active";

/**
 * Whether eve 1.0 answered the reset as done: 202 `{ ok: true, … }` (the
 * session ended), or 409 with code `session_not_active` (already ended,
 * expired or unknown).
 */
const isEve1ResetDone = (status: number, body: unknown): boolean =>
  (status === ACCEPTED && isEve1EndedAnswer(body)) ||
  (status === CONFLICT && isEve1NotActiveAnswer(body));

/**
 * Whether Arnold answered the reset of `sessionId` as done, in either eve
 * version's words (0.83 today, 1.0 after the flip). Anything else (another
 * status, another 409 code, a proxy, a misrouted ARNOLD_URL) leaves the
 * session possibly live.
 */
const isResetDone = (
  response: Response,
  body: unknown,
  sessionId: string
): boolean =>
  response.status === 200
    ? isEve083ResetDone(body, sessionId)
    : isEve1ResetDone(response.status, body);

/**
 * Resets one Arnold session through Arnold's eve channel
 * (`POST /eve/v1/session/:id/reset`), authenticated with the reset secret.
 * An unknown, already reset or expired session counts as done: eve 0.83
 * answers it `no_active_session`, eve 1.0 a 409 `session_not_active`.
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

    if (!isResetDone(response, body, sessionId)) {
      throw new Error(
        `Arnold session ${sessionId} reset failed: HTTP ${response.status} ${JSON.stringify(body)}`
      );
    }
  };
