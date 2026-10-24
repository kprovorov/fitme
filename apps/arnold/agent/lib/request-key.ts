import { createHash } from "node:crypto";
import type { ToolContext } from "eve/tools";

const sha256 = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Per execution of a step, keyed by its model input array: the call ids seen
 * for each identical call, in arrival order. The AI SDK hands every tool call
 * of one step execution the same `messages` array (eve passes it through as
 * `ctx.messages`), and a re-run step rebuilds it, so the array marks one
 * attempt. Dropped with the array.
 */
const attempts = new WeakMap<object, Map<string, string[]>>();

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
 * their call ids arrive within the attempt, so each adds its own row, and a
 * re-run's calls, counted afresh, get the same keys in the same order. A
 * re-run whose model asks with different input appends again, as `ai-agent`
 * always did.
 */
export const requestKey = (ctx: ToolContext, input: unknown): string => {
  const call = sha256([
    ctx.session.id,
    ctx.session.turn.id,
    ctx.messages.length,
    ctx.toolName,
    input,
  ]);
  let calls = attempts.get(ctx.messages);
  if (!calls) {
    calls = new Map();
    attempts.set(ctx.messages, calls);
  }
  const callIds = calls.get(call) ?? [];
  calls.set(call, callIds);
  let occurrence = callIds.indexOf(ctx.callId);
  if (occurrence === -1) {
    occurrence = callIds.push(ctx.callId) - 1;
  }
  return sha256([call, occurrence]);
};
