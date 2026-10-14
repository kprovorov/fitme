import {
  type CoachModelId,
  type CoachModelProvider,
  coachModels,
  defaultCoachModelId,
} from "@fitme/core";
import type { LanguageModel, ModelMessage } from "ai";
import { anthropic } from "eve/models/anthropic";
import { openai } from "eve/models/openai";

/** The turn asked for a model that isn't in `coachModels`. */
export class UnsupportedCoachModelError extends Error {
  constructor(requested: unknown) {
    super(
      `Unsupported coach model ${JSON.stringify(requested)}. Supported: ${coachModels.map(({ id }) => id).join(", ")}.`
    );
    this.name = "UnsupportedCoachModelError";
  }
}

// Direct providers, as the ai-agent function used: OPENAI_API_KEY and
// ANTHROPIC_API_KEY, no AI Gateway.
const providers: Record<CoachModelProvider, (id: string) => LanguageModel> = {
  anthropic,
  openai,
};

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

/** The `model` of the latest client context that names one, if any. */
const requestedModel = (messages: readonly ModelMessage[]): unknown => {
  for (const message of [...messages].reverse()) {
    for (const text of clientContextTexts(message).reverse()) {
      const context = parseClientContext(text);
      if (context && "model" in context) {
        return context.model;
      }
    }
  }
};

/**
 * The model a Coach turn runs on: the coach model id the client sends as
 * `clientContext: { model }`, or the default when it sends none. `coachModels`
 * in @fitme/core is the only list; any other value throws
 * `UnsupportedCoachModelError`, which fails the turn before the model runs.
 */
export const coachModelSelection = (
  messages: readonly ModelMessage[]
): { id: CoachModelId; model: LanguageModel } => {
  const requested = requestedModel(messages) ?? defaultCoachModelId;
  const coachModel = coachModels.find(({ id }) => id === requested);
  if (!coachModel) {
    throw new UnsupportedCoachModelError(requested);
  }
  return {
    id: coachModel.id,
    model: providers[coachModel.provider](coachModel.id),
  };
};
