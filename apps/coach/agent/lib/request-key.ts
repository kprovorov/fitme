import { createHash } from "node:crypto";
import type { ToolContext } from "eve/tools";

/**
 * A key for a tool call that stays the same when its durable step re-runs.
 * eve runs a tool inside the step that made the model call, so a step
 * interrupted after the tool committed re-runs the model call too: the same
 * model input (session, turn, the step's messages), but a new `callId`. The
 * key is built from that input plus the tool and its validated input, so a
 * repeated call carries the first one's key and the service returns the row
 * it already added. Two identical calls in one step share a key too, and add
 * one row.
 */
export const requestKey = (ctx: ToolContext, input: unknown): string =>
  createHash("sha256")
    .update(
      JSON.stringify([
        ctx.session.id,
        ctx.session.turn.id,
        ctx.messages.length,
        ctx.toolName,
        input,
      ])
    )
    .digest("hex");
