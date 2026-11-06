import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import type { ArnoldModelId } from "@fitme/core";
import type { ModelMessage } from "ai";
import type { AgentModelOptionsDefinition } from "eve";

import { latestClientContext } from "./client-context";

type RequestedArnoldModel = NonNullable<
  ReturnType<typeof latestClientContext>
>["model"];

/** The turn asked for a model that isn't in `arnoldModels`. */
export class UnsupportedArnoldModelError extends Error {
  constructor(requested: RequestedArnoldModel) {
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

const creatorOf = (id: ArnoldModelId): ArnoldModelCreator => {
  const creator = id.slice(0, id.indexOf("/"));

  if (creator === "anthropic" || creator === "openai") {
    return creator;
  }

  throw new Error(`Unsupported Arnold model creator ${creator}.`);
};

/** The supported `model` of the latest client context, or the default. */
const requestedModel = (messages: readonly ModelMessage[]): ArnoldModelId => {
  const requested =
    latestClientContext(messages)?.model ?? defaultArnoldModelId;

  const arnoldModel = arnoldModels.find(({ id }) => id === requested);

  if (!arnoldModel) {
    throw new UnsupportedArnoldModelError(requested);
  }

  return arnoldModel.id;
};

/**
 * The model an Arnold turn runs on: the Arnold model id the client sends as
 * `clientContext: { model }`, or the default when it sends none. `arnoldModels`
 * in @fitme/core is the only list; any other value throws
 * `UnsupportedArnoldModelError`, which fails the turn before the model runs.
 * The id is the Gateway's own, so eve routes the call through AI Gateway, with
 * the model's host order for failover.
 */
export const arnoldModelSelection = (messages: readonly ModelMessage[]) => {
  const model = requestedModel(messages);

  return {
    model,
    modelOptions: {
      providerOptions: {
        gateway: { order: [...hostOrder[creatorOf(model)]] },
      },
    } satisfies AgentModelOptionsDefinition,
  };
};
