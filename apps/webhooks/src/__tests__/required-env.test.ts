import { reportMissingEnv } from "@fitme/observability/node";
import { describe, expect, it, vi } from "vitest";
import { REQUIRED_ENV } from "../required-env";

describe("REQUIRED_ENV", () => {
  it("reports one error per variable on a production instance missing them all", async () => {
    const report = vi.fn((_error: unknown, _tags?: Record<string, string>) =>
      Promise.resolve()
    );

    const missing = await reportMissingEnv(REQUIRED_ENV, {
      env: { VERCEL_ENV: "production" },
      report,
    });

    expect(missing).toEqual([
      "CLERK_WEBHOOK_SIGNING_SECRET",
      "FITME_DATABASE_URL",
      "ARNOLD_URL",
      "ARNOLD_RESET_SECRET",
    ]);
    expect(report).toHaveBeenCalledTimes(missing.length);
  });

  it("accepts the pre-rename COACH_URL and COACH_RESET_SECRET", async () => {
    const report = vi.fn((_error: unknown, _tags?: Record<string, string>) =>
      Promise.resolve()
    );

    const missing = await reportMissingEnv(REQUIRED_ENV, {
      env: {
        CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test",
        COACH_RESET_SECRET: "secret",
        COACH_URL: "https://coach.test",
        FITME_DATABASE_URL: "postgresql://test",
        VERCEL_ENV: "production",
      },
      report,
    });

    expect(missing).toEqual([]);
  });
});
