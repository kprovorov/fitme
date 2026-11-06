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
      "CLERK_SECRET_KEY",
      "CLERK_PUBLISHABLE_KEY",
      "FITME_DATABASE_URL",
      "LIBRARY_URL",
      "LIBRARY_MCP_SECRET",
    ]);
    expect(report).toHaveBeenCalledTimes(missing.length);
  });
});
