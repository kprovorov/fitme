import { describe, expect, it } from "vitest";
import { tracePropagationTargets } from "../index";

// How Sentry applies the list: a URL gets trace headers when any target matches
const propagatesTo = (url: string) =>
  tracePropagationTargets.some((target) => target.test(url));

describe("tracePropagationTargets", () => {
  it.each([
    "https://api.fitmeproject.com/v1/client-config",
    "https://app.fitmeproject.com/dashboard",
    "https://arnold.fitmeproject.com/eve/v1/session",
    "https://coach.fitmeproject.com/eve/v1/session",
    "https://exercises.fitmeproject.com/exercises?limit=20",
    "https://library.fitmeproject.com/exercises?slugs=bench-press",
    "https://mcp.fitmeproject.com/",
    "https://webhooks.fitmeproject.com/clerk",
    "http://localhost:3003/v1/arnold/models",
    "http://127.0.0.1:3005/eve/v1/health",
    "/api/plans",
  ])("propagates to %s", (url) => {
    expect(propagatesTo(url)).toBe(true);
  });

  it.each([
    "https://clerk.fitmeproject.com/v1/client",
    "https://accounts.fitmeproject.com/sign-in",
    "https://fitmeproject.com/",
    "https://api.clerk.com/v1/users",
    "https://api.revenuecat.com/v1/subscribers/user_1",
    "https://abcdefgh.supabase.co/rest/v1/plans",
    "https://api.fitmeproject.com.evil.example/",
    "https://arnold.fitmeproject.com.evil.example/",
    "https://arnoldfitmeproject.com/",
    "https://evil-arnold.fitmeproject.com/",
    "https://evil.example/?next=https://api.fitmeproject.com",
    "http://localhost.evil.example/",
    "//evil.example/path",
  ])("does not propagate to %s", (url) => {
    expect(propagatesTo(url)).toBe(false);
  });
});
