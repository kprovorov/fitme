import { afterEach, describe, expect, it, vi } from "vitest";

import { libraryFromEnv } from "../library.js";
import { recordingReporter } from "./harness.js";

describe(libraryFromEnv, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves the committed fixture with media on SUPABASE_URL outside production", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("LIBRARY_V2_BUNDLE", "");
    vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
    const { reportError, reported } = recordingReporter();

    const answer = await libraryFromEnv(reportError).get();

    expect(answer.status).toBe("ready");
    expect(reported).toStrictEqual([]);

    const [first] =
      answer.status === "ready" ? answer.library.list({ limit: 1 }).data : [];

    expect(
      first?.video_url.startsWith("https://project.supabase.co/")
    ).toBeTruthy();
  });

  it("never serves placeholder media in production: an unset SUPABASE_URL is a reported, unavailable Library", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "");
    const { reportError, reported } = recordingReporter();

    const answer = await libraryFromEnv(reportError).get();

    expect(answer).toStrictEqual({ status: "unavailable" });
    expect(reported).toStrictEqual([expect.any(Error)]);
  });
});
