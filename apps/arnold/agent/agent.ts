import { defineAgent, defineDynamic } from "eve";
import { coachModelSelection } from "./lib/models";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default defineAgent({
  // Only our own tools: no shell, file or web tools.
  defaultTools: false,
  // Keep an ended run's data for the plan's default period. Without this,
  // eve deletes a private session's run data as soon as its run ends, and
  // account deletion relies on a reset session's stream outliving the reset.
  experimental: {
    workflow: {
      retention: "default",
    },
  },
  limits: {
    // A Conversation ends 30 days after it started; the next message the app
    // sends needs a new one.
    sessionTimeoutMs: THIRTY_DAYS_MS,
  },
  // The client picks the model per turn (clientContext `{ model }`), from
  // coachModels only, and every call goes through AI Gateway (OIDC deployed,
  // AI_GATEWAY_API_KEY locally). Resolved on every model call, where the
  // client context is in the messages.
  model: defineDynamic({
    events: {
      "step.started": (_event, ctx) => coachModelSelection(ctx.messages),
    },
  }),
});
