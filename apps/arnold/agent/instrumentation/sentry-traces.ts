import { OTLPHttpProtoTraceExporter } from "@vercel/otel";
import { disableInstrumentation } from "eve/instrumentation";
import { otelIntegration } from "eve/instrumentation/otel";
import { sentryExportPolicy, sentryOtlpExport } from "../lib/trace-export";

// Turns, steps and tool calls to the fitme-arnold Sentry project over OTLP,
// metadata only (see sentryExportPolicy). Without SENTRY_OTLP_TRACES_URL and
// SENTRY_DSN (local dev, evals, tests) nothing is exported.
const sentry = sentryOtlpExport(process.env);

export default sentry
  ? otelIntegration({
      exportPolicy: sentryExportPolicy,
      traceExporter: new OTLPHttpProtoTraceExporter(sentry),
    })
  : disableInstrumentation();
