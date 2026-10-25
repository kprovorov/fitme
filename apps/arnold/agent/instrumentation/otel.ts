import { resolveObservabilityConfig } from "@fitme/observability";
import { otel } from "eve/instrumentation/otel";
import { arnoldTracePolicy } from "../lib/trace-export";

// Process-wide trace settings, shared by every destination (Sentry, Vercel
// Agent Runs, eve dev's local traces). The environment is the one errors are
// reported under.
export default otel({
  resource: {
    "deployment.environment": resolveObservabilityConfig({
      dsn: process.env.SENTRY_DSN,
      env: { VERCEL_ENV: process.env.VERCEL_ENV },
    }).environment,
  },
  tracePolicy: arnoldTracePolicy,
});
