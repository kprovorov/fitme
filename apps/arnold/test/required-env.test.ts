import { reportMissingEnv } from "@fitme/observability/node";
import { describe, expect, it, vi } from "vitest";
import { REQUIRED_ENV } from "../agent/lib/required-env";

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
      "CLERK_JWT_KEY",
      "REVENUECAT_SECRET_KEY",
      "FITME_DATABASE_URL",
      "LIBRARY_URL",
      "LIBRARY_ARNOLD_SECRET",
      "ARNOLD_RESET_SECRET",
    ]);
    expect(report).toHaveBeenCalledTimes(missing.length);
  });

  it("accepts the pre-rename COACH_RESET_SECRET", async () => {
    const report = vi.fn((_error: unknown, _tags?: Record<string, string>) =>
      Promise.resolve()
    );

    const missing = await reportMissingEnv(REQUIRED_ENV, {
      env: { COACH_RESET_SECRET: "secret", VERCEL_ENV: "production" },
      report,
    });

    expect(missing).not.toContain("ARNOLD_RESET_SECRET");
  });
});
