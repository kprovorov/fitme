import {
  type ArnoldModelId,
  arnoldModels,
  defaultArnoldModelId,
} from "@fitme/core";
import type { ModelMessage } from "ai";
import type { AgentModelOptionsDefinition } from "eve";

/** The turn asked for a model that isn't in `arnoldModels`. */
export class UnsupportedArnoldModelError extends Error {
  constructor(requested: unknown) {
    super(
      `Unsupported Arnold model ${JSON.stringify(requested)}. Supported: ${arnoldModels.map(({ id }) => id).join(", ")}.`
    );
    this.name = "UnsupportedArnoldModelError";
  }
}

type ArnoldModelCreator = ArnoldModelId extends `${infer Creator}/${string}`
  ? Creator
  : never;

// The AI Gateway hosts each model on several providers. A failed call moves to
// the next host of the same model, in this order; nothing names a fallback
// model, so the Gateway never swaps the model the User picked. Slugs:
// https://vercel.com/docs/ai-gateway/provider-options#available-providers
const hostOrder: Record<ArnoldModelCreator, string[]> = {
  anthropic: ["anthropic", "bedrock", "vertex"],
  openai: ["openai", "azure", "bedrock"],
};

const creatorOf = (id: ArnoldModelId) =>
  id.slice(0, id.indexOf("/")) as ArnoldModelCreator;

// eve hands a turn's `clientContext` object to the model as a user-role
// framework message of this kind: the prefix, then the object as JSON. A
// User's own messages have kind "user", so typing this text selects nothing.
// eve is pinned exactly; check this format on every bump.
const CLIENT_CONTEXT_KIND = "context.instruction";
const CLIENT_CONTEXT_PREFIX = "Client context:\n";

const clientContextTexts = (message: ModelMessage): string[] => {
  const { kind } = message as { kind?: unknown };
  if (message.role !== "user" || kind !== CLIENT_CONTEXT_KIND) {
    return [];
  }
  if (typeof message.content === "string") {
    return [message.content];
  }
  return message.content.flatMap((part) =>
    part.type === "text" ? [part.text] : []
  );
};

const parseClientContext = (text: string): Record<string, unknown> | null => {
  if (!text.startsWith(CLIENT_CONTEXT_PREFIX)) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(text.slice(CLIENT_CONTEXT_PREFIX.length));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/** The `model` of the latest client context, if it names one. */
const requestedModel = (messages: readonly ModelMessage[]): unknown => {
  for (const message of [...messages].reverse()) {
    for (const text of clientContextTexts(message).reverse()) {
      const context = parseClientContext(text);
      if (context) {
        return context.model;
      }
    }
  }
};

/**
 * The model a Coach turn runs on: the Arnold model id the client sends as
 * `clientContext: { model }`, or the default when it sends none. `arnoldModels`
 * in @fitme/core is the only list; any other value throws
 * `UnsupportedArnoldModelError`, which fails the turn before the model runs.
 * The id is the Gateway's own, so eve routes the call through AI Gateway, with
 * the model's host order for failover.
 */
export const coachModelSelection = (
  messages: readonly ModelMessage[]
): { model: ArnoldModelId; modelOptions: AgentModelOptionsDefinition } => {
  const requested = requestedModel(messages) ?? defaultArnoldModelId;
  const coachModel = arnoldModels.find(({ id }) => id === requested);
  if (!coachModel) {
    throw new UnsupportedArnoldModelError(requested);
  }
  return {
    model: coachModel.id,
    modelOptions: {
      providerOptions: {
        gateway: { order: [...hostOrder[creatorOf(coachModel.id)]] },
      },
    },
  };
};
