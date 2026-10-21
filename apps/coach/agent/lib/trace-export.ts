import type {
  SpanExportPolicy,
  TraceCapturePolicy,
} from "eve/instrumentation/otel";

/**
 * Process-wide: spans carry Conversation content (prompts, tool arguments,
 * answers, tool results) only in local development, whatever the channel's
 * audience. Every destination (Sentry, Vercel Agent Runs) gets metadata only.
 */
export const coachTracePolicy: TraceCapturePolicy = ({ environment }) => {
  const local = environment === "development";
  return { emit: true, recordInputs: local, recordOutputs: local };
};

// Usage: tokens and cost, under every prefix eve and the AI SDK use.
const KEPT_PREFIXES = ["gen_ai.usage.", "agent.usage.", "ai.usage."];

// Turn and step structure, model, tool names and timings. Nothing here holds
// text a User or the model wrote.
const KEPT_KEYS = new Set([
  "agent.action.kind",
  "agent.action.name",
  "agent.action.outcome",
  "agent.channel.audience",
  "agent.channel.kind",
  "agent.channel.name",
  "agent.framework.name",
  "agent.framework.version",
  "agent.invocation.role",
  "agent.model.id",
  "agent.name",
  "agent.run.id",
  "agent.run.type",
  "agent.step.attempt",
  "agent.step.index",
  "agent.tool.is_framework",
  "agent.trace.schema.version",
  "agent.turn.id",
  "agent.turn.sequence",
  "ai.model.id",
  "ai.model.provider",
  "ai.operationId",
  "ai.response.avgOutputTokensPerSecond",
  "ai.response.finishReason",
  "ai.response.id",
  "ai.response.model",
  "ai.response.msToFinish",
  "ai.response.msToFirstChunk",
  "ai.response.timestamp",
  "ai.stream.msToFirstChunk",
  "ai.telemetry.functionId",
  "ai.toolCall.id",
  "ai.toolCall.name",
  "error.type",
  "gen_ai.agent.name",
  "gen_ai.client.operation.duration",
  "gen_ai.client.operation.time_per_output_chunk",
  "gen_ai.client.operation.time_to_first_chunk",
  "gen_ai.conversation.id",
  "gen_ai.execute_tool.duration",
  "gen_ai.operation.name",
  "gen_ai.provider.name",
  "gen_ai.request.max_tokens",
  "gen_ai.request.model",
  "gen_ai.response.finish_reasons",
  "gen_ai.response.id",
  "gen_ai.response.model",
  "gen_ai.system",
  "gen_ai.tool.call.id",
  "gen_ai.tool.name",
  "gen_ai.tool.type",
  "operation.name",
]);

const isMetadata = (key: string): boolean =>
  KEPT_KEYS.has(key) || KEPT_PREFIXES.some((prefix) => key.startsWith(prefix));

/**
 * What Sentry receives: every span with its inputs and outputs redacted, and
 * then only the attributes known to be metadata. An allowlist, so an attribute
 * a later eve or AI SDK adds (content or not) stays out until it's listed.
 */
export const sentryExportPolicy: SpanExportPolicy = {
  attribute: ({ key }) => ({ emit: isMetadata(key) }),
  span: () => ({ inputs: true, outputs: true, redact: true }),
};

export interface SentryOtlpEnv {
  SENTRY_DSN?: string;
  SENTRY_OTLP_TRACES_URL?: string;
}

/**
 * Sentry's OTLP traces endpoint and its auth header (the DSN's public key), or
 * null without both (local dev, evals, tests): then nothing is exported.
 */
export const sentryOtlpExport = ({
  SENTRY_DSN,
  SENTRY_OTLP_TRACES_URL,
}: SentryOtlpEnv): {
  headers: Record<string, string>;
  url: string;
} | null => {
  if (!(SENTRY_OTLP_TRACES_URL && SENTRY_DSN && URL.canParse(SENTRY_DSN))) {
    return null;
  }
  const publicKey = new URL(SENTRY_DSN).username;
  if (!publicKey) {
    return null;
  }
  return {
    headers: { "x-sentry-auth": `sentry sentry_key=${publicKey}` },
    url: SENTRY_OTLP_TRACES_URL,
  };
};
