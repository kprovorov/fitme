import { browserTracingIntegration, init } from "@sentry/nextjs";

import { sentryOptions } from "~/lib/observability";

// Browser Sentry: errors and page-load / navigation traces. No Session Replay
// (never added) and no web vitals (Vercel Speed Insights covers those).
init({
  ...sentryOptions(),
  integrations: [
    // browserTracingIntegration adds the real WebVitals integration (LCP,
    // CLS, INP, FCP, TTFB) only when none is registered: this empty one
    // under its name keeps it out.
    { name: "WebVitals" },
    browserTracingIntegration({
      enableInp: false,
      enableLongTask: false,
    }),
  ],
});

export { captureRouterTransitionStart as onRouterTransitionStart } from "@sentry/nextjs";
