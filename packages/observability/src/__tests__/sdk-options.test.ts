import { describe, expect, it } from "vitest";
import { resolveObservabilityConfig } from "../config";
import { tracePropagationTargets } from "../propagation";
import { scrubEvent } from "../scrub";
import { sdkOptions } from "../sdk-options";

const production = resolveObservabilityConfig({
  dsn: "https://key@o1.ingest.sentry.io/1",
  env: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "abc123" },
});

describe("sdkOptions", () => {
  it("carries the resolved environment, release and sampling", () => {
    expect(sdkOptions(production)).toMatchObject({
      dsn: "https://key@o1.ingest.sentry.io/1",
      enabled: true,
      environment: "production",
      release: "abc123",
      tracesSampleRate: 0.2,
    });
  });

  it("sends nothing without a DSN", () => {
    const options = sdkOptions(
      resolveObservabilityConfig({ dsn: undefined, env: {} })
    );
    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
  });

  it("scrubs every event and transaction", () => {
    const options = sdkOptions(production);
    expect(options.beforeSend).toBe(scrubEvent);
    expect(options.beforeSendTransaction).toBe(scrubEvent);
    expect(options.traceLifecycle).toBe("static");
  });

  it("collects no credentials, bodies or User data", () => {
    const { dataCollection } = sdkOptions(production);
    expect(dataCollection).toMatchObject({
      cookies: false,
      httpBodies: [],
      httpHeaders: {
        request: { deny: expect.arrayContaining(["authorization", "cookie"]) },
        response: false,
      },
      stackFrameVariables: false,
      userInfo: false,
    });
  });

  it("propagates traces to our services only", () => {
    expect(sdkOptions(production).tracePropagationTargets).toBe(
      tracePropagationTargets
    );
  });
});
