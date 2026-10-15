import { createHash } from "node:crypto";
import type { ToolContext } from "eve/tools";

/**
 * How long the identical calls of one step keep counting up. A step's tool
 * calls start within moments of each other; a re-run of an interrupted step
 * (crash, redeploy, timeout) comes much later, usually in another instance.
 */
const ATTEMPT_WINDOW_MS = 30_000;

const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Per identical call: the call ids seen in the current attempt, in order. */
const attempts = new Map<string, { callIds: string[]; startedAt: number }>();

const forgetOldAttempts = (now: number) => {
  for (const [call, attempt] of attempts) {
    if (now - attempt.startedAt > ATTEMPT_WINDOW_MS) {
      attempts.delete(call);
    }
  }
};

/**
 * A key for a tool call that stays the same when its durable step re-runs.
 * eve runs a tool inside the step that made the model call, so a step
 * interrupted after the tool committed re-runs the model call too: the same
 * model input (session, turn, the step's messages), but new call ids. The key
 * hashes that input with the tool and its validated input, so a repeated call
 * carries the first one's key and the service returns the row it already
 * added.
 *
 * Identical calls in one step ("add two sets") are told apart by the order
 * their call ids arrive in this instance, so each adds its own row, and a
 * re-run's calls get the same keys in the same order. A re-run on the same
 * instance within `ATTEMPT_WINDOW_MS` counts on from the first attempt's
 * calls and appends again, as `ai-agent` always did; so does a re-run whose
 * model asks with different input.
 */
export const requestKey = (ctx: ToolContext, input: unknown): string => {
  const now = Date.now();
  forgetOldAttempts(now);
  const call = sha256([
    ctx.session.id,
    ctx.session.turn.id,
    ctx.messages.length,
    ctx.toolName,
    input,
  ]);
  let attempt = attempts.get(call);
  if (!attempt) {
    attempt = { callIds: [], startedAt: now };
    attempts.set(call, attempt);
  }
  let occurrence = attempt.callIds.indexOf(ctx.callId);
  if (occurrence === -1) {
    occurrence = attempt.callIds.push(ctx.callId) - 1;
  }
  return sha256([call, occurrence]);
};
