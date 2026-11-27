import { reportMissingEnv } from "@fitme/observability/node";
import { describe, expect, it, vi } from "vitest";

import { REQUIRED_ENV } from "../required-env";

describe("required environment variables", () => {
  it("reports one error per variable on a production instance missing them all", async () => {
    const report = vi.fn<() => Promise<void>>(() => Promise.resolve());

    const missing = await reportMissingEnv(REQUIRED_ENV, {
      env: { VERCEL_ENV: "production" },
      report,
    });

    expect(missing).toStrictEqual([
      "CLERK_WEBHOOK_SIGNING_SECRET",
      "FITME_DATABASE_URL",
      "ARNOLD_URL",
      "ARNOLD_RESET_SECRET",
      "POSTHOG_PERSONAL_API_KEY",
      "POSTHOG_PROJECT_ID",
    ]);
    expect(report).toHaveBeenCalledTimes(missing.length);
  });

  it("doesn't take the pre-rename COACH_URL and COACH_RESET_SECRET", async () => {
    const report = vi.fn<() => Promise<void>>(() => Promise.resolve());

    const missing = await reportMissingEnv(REQUIRED_ENV, {
      env: {
        CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test",
        COACH_RESET_SECRET: "secret",
        COACH_URL: "https://coach.test",
        FITME_DATABASE_URL: "postgresql://test",
        POSTHOG_PERSONAL_API_KEY: "phx_test",
        POSTHOG_PROJECT_ID: "1",
        VERCEL_ENV: "production",
      },
      report,
    });

    expect(missing).toStrictEqual(["ARNOLD_URL", "ARNOLD_RESET_SECRET"]);
  });
});
