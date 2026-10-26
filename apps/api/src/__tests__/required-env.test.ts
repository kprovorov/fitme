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
      "CLERK_JWT_KEY",
      "FITME_DATABASE_URL",
      "LIBRARY_URL",
      "LIBRARY_PUBLIC_API_SECRET",
    ]);
    expect(report).toHaveBeenCalledTimes(missing.length);
  });
});
