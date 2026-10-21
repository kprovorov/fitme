import type { ObservabilityConfig } from "./config";
import { tracePropagationTargets } from "./propagation";
import { SECRET_HEADERS, scrubEvent } from "./scrub";

/**
 * The SDK options every platform starts Sentry with, from the resolved
 * config: plain data and the scrubber, no SDK import, so the Node setup and
 * the Next app (browser, Node and edge) share one set of privacy rules. A
 * platform adds only what is its own (integrations, tags).
 */
export const sdkOptions = (config: ObservabilityConfig) => ({
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  // SDK 11's replacement for `sendDefaultPii: false`, stricter than its
  // defaults: nothing that could carry a token, a body or User data
  dataCollection: {
    cookies: false,
    databaseQueryData: false,
    genAI: { inputs: false, outputs: false },
    httpBodies: [],
    httpHeaders: { request: { deny: SECRET_HEADERS }, response: false },
    stackFrameVariables: false,
    userInfo: false,
  },
  dsn: config.dsn,
  enabled: config.enabled,
  environment: config.environment,
  release: config.release,
  // Whole transactions, not streamed spans, so beforeSendTransaction (the
  // scrubber) sees every one
  traceLifecycle: "static" as const,
  tracePropagationTargets,
  tracesSampleRate: config.tracesSampleRate,
});
