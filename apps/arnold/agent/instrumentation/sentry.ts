import { initObservability } from "@fitme/observability/node";
import { defineInstrumentation } from "eve/instrumentation";

// Error reporting (reportError from @fitme/observability/node), started once
// at server startup. Tracing stays off: traces go through eve's OpenTelemetry
// (sentry-traces.ts), so the Sentry SDK doesn't instrument the runtime twice.
export default defineInstrumentation({
  setup: () => {
    initObservability({ service: "arnold", tracing: false });
  },
});
