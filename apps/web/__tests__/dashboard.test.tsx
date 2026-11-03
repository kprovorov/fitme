import type { PublicApiFetch } from "@fitme/api-client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DashboardView } from "~/components/dashboard/dashboard-view";
import { type DashboardData, loadDashboard } from "~/lib/dashboard";

const API_URL = "https://api.test";
const SESSION_TOKEN = "clerk-session-token";

const plan = (fields: Partial<DashboardData["plans"][number]> = {}) => ({
  created_at: "2026-10-20T09:00:00+00:00",
  description: "Three full-body days",
  experience_level: "intermediate",
  frequency: 3,
  goal: "build_muscle",
  id: "11111111-1111-4111-8111-111111111111",
  is_active: true,
  name: "Full body",
  note: null,
  place: "gym",
  updated_at: "2026-10-21T09:00:00+00:00",
  workout_duration: 60,
  workouts: [],
  ...fields,
});

const session = (fields: Partial<DashboardData["sessions"][number]> = {}) => ({
  completed_rep_count: 64,
  exercise_count: 5,
  finished_at: "2026-10-21T11:00:00+00:00",
  id: "33333333-3333-4333-8333-333333333333",
  logged_set_count: 8,
  personal_records: [],
  plan: { id: "11111111-1111-4111-8111-111111111111", name: "Full body" },
  set_count: 15,
  started_at: "2026-10-21T10:00:00+00:00",
  status: "finished" as const,
  volume: 4250,
  workout: { id: "22222222-2222-4222-8222-222222222222", name: "Day A" },
  ...fields,
});

/** Answers each `/v1` path like the API does; anything else fails the test. */
const api = (routes: Record<string, () => Response>) =>
  vi.fn<PublicApiFetch>((url) => {
    const { pathname } = new URL(url);
    const route = routes[pathname];
    if (!route) {
      throw new Error(`No fake answer for ${url}`);
    }
    return Promise.resolve(route());
  });

const serving = (plans: unknown[], sessions: unknown[]) =>
  api({
    "/v1/plans": () => Response.json({ data: plans }),
    "/v1/workout-sessions": () =>
      Response.json({
        data: sessions,
        hasMore: false,
        total: sessions.length,
        weight_unit: "kg",
      }),
  });

const errorResponse = (
  status: number,
  code: string,
  headers: HeadersInit = {}
) =>
  new Response(
    JSON.stringify({ error: { code, message: `${code} message` } }),
    { headers: { "Content-Type": "application/json", ...headers }, status }
  );

const load = (fetch: PublicApiFetch, { apiUrl = API_URL } = {}) =>
  loadDashboard({
    apiUrl,
    fetch,
    getToken: () => Promise.resolve(SESSION_TOKEN),
  });

describe("loadDashboard", () => {
  it("reads the Plans and the recent Workout Sessions with the Clerk session token as the bearer", async () => {
    const fetch = serving([plan()], [session()]);

    const result = await load(fetch);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected the read to succeed");
    }
    expect(result.data.plans).toEqual([plan()]);
    expect(result.data.sessions).toEqual([session()]);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init.headers).get("Authorization")).toBe(
        `Bearer ${SESSION_TOKEN}`
      );
    }
    const paths = fetch.mock.calls.map(([url]) => url);
    expect(paths).toContain(`${API_URL}/v1/plans`);
    expect(
      paths.some((url) => url.startsWith(`${API_URL}/v1/workout-sessions?`))
    ).toBe(true);
  });

  it("shows the active Plan first, then the newest", async () => {
    const older = plan({
      created_at: "2026-10-01T09:00:00+00:00",
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      is_active: false,
      name: "Older",
    });
    const newer = plan({
      created_at: "2026-10-30T09:00:00+00:00",
      id: "bbbbbbbb-1111-4111-8111-111111111111",
      is_active: false,
      name: "Newer",
    });
    const active = plan({ id: "cccccccc-1111-4111-8111-111111111111" });

    const result = await load(serving([newer, active, older], []));

    if (!result.ok) {
      throw new Error("Expected the read to succeed");
    }
    expect(result.data.plans.map((p) => p.name)).toEqual([
      "Full body",
      "Newer",
      "Older",
    ]);
  });

  it("fails with the API's error when a read fails", async () => {
    const result = await load(
      api({
        "/v1/plans": () => errorResponse(500, "internal_error"),
        "/v1/workout-sessions": () => Response.json({ data: [] }),
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected the read to fail");
    }
    expect(result.error.status).toBe(500);
  });

  it("carries the seconds to wait for a 429", async () => {
    const result = await load(
      api({
        "/v1/plans": () =>
          errorResponse(429, "rate_limited", { "Retry-After": "30" }),
        "/v1/workout-sessions": () => Response.json({ data: [] }),
      })
    );

    if (result.ok) {
      throw new Error("Expected the read to fail");
    }
    expect(result.error.code).toBe("rate_limited");
    expect(result.error.retryAfterSeconds).toBe(30);
  });

  it("fails without sending a request when the API URL is unset", async () => {
    const fetch = serving([plan()], [session()]);

    const result = await load(fetch, { apiUrl: "" });

    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("DashboardView", () => {
  it("renders the Plans and the recent Workout Sessions", async () => {
    const result = await load(serving([plan()], [session()]));
    if (!result.ok) {
      throw new Error("Expected the read to succeed");
    }

    const markup = renderToStaticMarkup(<DashboardView data={result.data} />);

    expect(markup).toContain("Full body");
    expect(markup).toContain("Three full-body days");
    expect(markup).toContain("Day A");
  });

  it("renders the empty state without Plans or sessions", async () => {
    const result = await load(serving([], []));
    if (!result.ok) {
      throw new Error("Expected the read to succeed");
    }

    const markup = renderToStaticMarkup(<DashboardView data={result.data} />);

    expect(markup).toContain("No plans yet");
    expect(markup).toContain("Workouts you log in the Fitme app show up here.");
  });

  it("renders the error state instead of crashing when the read failed", async () => {
    const result = await load(
      api({
        "/v1/plans": () => errorResponse(500, "internal_error"),
        "/v1/workout-sessions": () => Response.json({ data: [] }),
      })
    );
    if (result.ok) {
      throw new Error("Expected the read to fail");
    }

    const markup = renderToStaticMarkup(<DashboardView error={result.error} />);

    expect(markup).toContain("Couldn&#x27;t load your training");
  });

  it("says how long to wait after a 429", async () => {
    const result = await load(
      api({
        "/v1/plans": () =>
          errorResponse(429, "rate_limited", { "Retry-After": "30" }),
        "/v1/workout-sessions": () => Response.json({ data: [] }),
      })
    );
    if (result.ok) {
      throw new Error("Expected the read to fail");
    }

    const markup = renderToStaticMarkup(<DashboardView error={result.error} />);

    expect(markup).toContain("30 seconds");
  });
});
