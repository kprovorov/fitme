import { tracePropagationTargets } from "@fitme/observability";
import { describe, expect, it } from "vitest";

const propagated = (url: string) =>
  tracePropagationTargets.some((target) => target.test(url));

describe("trace propagation", () => {
  it("sends trace headers to the Public API the dashboard reads", () => {
    expect(propagated("https://api.fitmeproject.com/v1/plans")).toBe(true);
    expect(propagated("http://localhost:3003/v1/plans")).toBe(true);
  });

  it("sends them to no third party, whatever PUBLIC_API_URL were set to", () => {
    for (const url of [
      "https://clerk.fitmeproject.com/v1/client",
      "https://api.revenuecat.com/v1/subscribers/x",
      "https://project.supabase.co/rest/v1/plans",
      "https://api.fitmeproject.com.evil.test/v1/plans",
    ]) {
      expect(propagated(url)).toBe(false);
    }
  });
});
