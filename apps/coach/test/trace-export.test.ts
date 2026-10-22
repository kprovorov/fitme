import type {
  SpanExportContext,
  TraceCaptureContext,
} from "eve/instrumentation/otel";
import { describe, expect, it } from "vitest";
import {
  coachTracePolicy,
  sentryExportPolicy,
  sentryOtlpExport,
} from "../agent/lib/trace-export";

const span: SpanExportContext = {
  attributes: {},
  audience: "private",
  name: "chat openai/gpt-5.5",
  spanId: "span",
  traceId: "trace",
};

const keeps = (key: string, value: unknown = "x") =>
  sentryExportPolicy.attribute?.({ key, span, value });

describe("sentryExportPolicy", () => {
  it("keeps every span, redacting its inputs and outputs", () => {
    expect(sentryExportPolicy.span?.(span)).toEqual({
      inputs: true,
      outputs: true,
      redact: true,
    });
  });

  it.each([
    "gen_ai.request.model",
    "gen_ai.response.model",
    "ai.model.id",
    "agent.model.id",
    "gen_ai.usage.input_tokens",
    "gen_ai.usage.output_tokens",
    "ai.usage.totalTokens",
    "agent.usage.cost_usd",
    "gen_ai.usage.cost",
    "gen_ai.tool.name",
    "ai.toolCall.name",
    "agent.action.name",
    "agent.turn.id",
    "agent.turn.outcome",
    "eve.tool.outcome",
    "agent.step.index",
    "gen_ai.operation.name",
    "gen_ai.conversation.id",
    "ai.response.msToFinish",
    "error.type",
  ])("keeps the metadata attribute %s", (key) => {
    expect(keeps(key, 1)).toEqual({ emit: true });
  });

  it.each([
    "gen_ai.input.messages",
    "gen_ai.output.messages",
    "gen_ai.system_instructions",
    "gen_ai.tool.call.arguments",
    "gen_ai.tool.call.result",
    "gen_ai.tool.definitions",
    "ai.prompt",
    "ai.prompt.messages",
    "ai.response.text",
    "ai.response.reasoning",
    "ai.response.toolCalls",
    "ai.toolCall.args",
    "ai.toolCall.result",
    "agent.session.title",
    "agent.channel.delivery.input",
    "agent.principal.initiator.id",
    "ai.settings.context.fitme.note",
    "some.future.content",
  ])("drops %s", (key) => {
    expect(keeps(key, "I hurt my knee, what should I train?")).toEqual({
      emit: false,
    });
  });
});

describe("coachTracePolicy", () => {
  const trace: Omit<TraceCaptureContext, "environment"> = {
    agentName: "coach",
    audience: "public",
    channel: { kind: "http", name: "eve" },
    principalType: "user",
  };

  it.each(["preview", "production"] as const)(
    "records no content in %s, whatever the audience",
    (environment) => {
      expect(coachTracePolicy({ ...trace, environment })).toEqual({
        emit: true,
        recordInputs: false,
        recordOutputs: false,
      });
    }
  );

  it("records content in local development", () => {
    expect(coachTracePolicy({ ...trace, environment: "development" })).toEqual({
      emit: true,
      recordInputs: true,
      recordOutputs: true,
    });
  });
});

describe("sentryOtlpExport", () => {
  const url = "https://o1.ingest.us.sentry.io/api/2/integration/otlp/v1/traces";
  const dsn = "https://publickey@o1.ingest.us.sentry.io/2";

  it("exports to SENTRY_OTLP_TRACES_URL with the DSN's public key", () => {
    expect(
      sentryOtlpExport({ SENTRY_DSN: dsn, SENTRY_OTLP_TRACES_URL: url })
    ).toEqual({
      headers: { "x-sentry-auth": "sentry sentry_key=publickey" },
      url,
    });
  });

  it.each([
    { SENTRY_DSN: dsn },
    { SENTRY_OTLP_TRACES_URL: url },
    { SENTRY_DSN: "", SENTRY_OTLP_TRACES_URL: "" },
    { SENTRY_DSN: "not a url", SENTRY_OTLP_TRACES_URL: url },
    {},
  ])("exports nothing without both (%o)", (env) => {
    expect(sentryOtlpExport(env)).toBeNull();
  });
});
