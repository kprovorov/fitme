import { describe, expect, it } from "vitest";
import { resolveObservabilityConfig } from "../index";

const DSN = "https://key@o1.ingest.sentry.io/2";
const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("resolveObservabilityConfig", () => {
  it("samples 20% of traces in production, tagged with the commit", () => {
    expect(
      resolveObservabilityConfig({
        dsn: DSN,
        env: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA },
      })
    ).toEqual({
      dsn: DSN,
      enabled: true,
      environment: "production",
      release: SHA,
      tracesSampleRate: 0.2,
    });
  });

  it("samples every trace in preview", () => {
    expect(
      resolveObservabilityConfig({
        dsn: DSN,
        env: { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_SHA: SHA },
      })
    ).toEqual({
      dsn: DSN,
      enabled: true,
      environment: "preview",
      release: SHA,
      tracesSampleRate: 1,
    });
  });

  it.each([undefined, ""])("sends nothing without a DSN (%j)", (dsn) => {
    expect(
      resolveObservabilityConfig({
        dsn,
        env: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: SHA },
      })
    ).toMatchObject({ dsn: undefined, enabled: false, tracesSampleRate: 0 });
  });

  it("counts a run outside Vercel as development, with no release", () => {
    expect(resolveObservabilityConfig({ dsn: DSN, env: {} })).toEqual({
      dsn: DSN,
      enabled: true,
      environment: "development",
      release: undefined,
      tracesSampleRate: 1,
    });
  });
});
