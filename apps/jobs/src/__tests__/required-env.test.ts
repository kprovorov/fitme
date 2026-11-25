import { reportMissingEnv } from "@fitme/observability/node";
import { describe, expect, it, vi } from "vitest";

import { REQUIRED_ENV } from "../required-env";

describe("required environment variables", () => {
  it("reports the database URL missing on a production instance", async () => {
    const report = vi.fn<() => Promise<void>>(() => Promise.resolve());

    const missing = await reportMissingEnv(REQUIRED_ENV, {
      env: { VERCEL_ENV: "production" },
      report,
    });

    expect(missing).toStrictEqual(["FITME_DATABASE_URL"]);
    expect(report).toHaveBeenCalledOnce();
  });
});
