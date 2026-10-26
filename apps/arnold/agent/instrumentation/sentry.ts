import { initObservability, reportMissingEnv } from "@fitme/observability/node";
import { defineInstrumentation } from "eve/instrumentation";
import { REQUIRED_ENV } from "../lib/required-env";

// Error reporting (reportError from @fitme/observability/node), started once
// at server startup. Tracing stays off: traces go through eve's OpenTelemetry
// (sentry-traces.ts), so the Sentry SDK doesn't instrument the runtime twice.
// On production, a lost env variable is reported before any request fails on
// it (eve awaits setup before loading the server).
export default defineInstrumentation({
  setup: async () => {
    initObservability({ service: "arnold", tracing: false });
    await reportMissingEnv(REQUIRED_ENV);
  },
});
