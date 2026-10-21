import { otel } from "eve/instrumentation/otel";
import { coachTracePolicy } from "../lib/trace-export";

// Process-wide trace settings, shared by every destination (Sentry, Vercel
// Agent Runs, eve dev's local traces).
export default otel({
  resource: {
    "deployment.environment": process.env.VERCEL_ENV ?? "development",
  },
  tracePolicy: coachTracePolicy,
});
