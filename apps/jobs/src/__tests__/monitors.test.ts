import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RUN_BUDGET_MS } from "../jobs/forgotten-workout-sessions";
import { FORGOTTEN_WORKOUT_SESSIONS_MONITOR } from "../monitors";

interface VercelConfig {
  functions: Record<string, { maxDuration?: number }>;
  schedules: Record<string, { function: string; schedule: string }>;
}

const vercel = JSON.parse(
  readFileSync(new URL("../../vercel.json", import.meta.url), "utf-8")
) as VercelConfig;

describe("the forgotten-workout-sessions monitor", () => {
  it("is named and scheduled as the Vercel schedule", () => {
    const schedule = vercel.schedules[FORGOTTEN_WORKOUT_SESSIONS_MONITOR.slug];

    expect(schedule).toStrictEqual({
      function: "api/forgotten-workout-sessions",
      schedule: "*/10 * * * *",
    });
    expect(FORGOTTEN_WORKOUT_SESSIONS_MONITOR.schedule).toBe(
      schedule?.schedule
    );
  });

  it("allows for Vercel's jitter, at most 15 minutes", () => {
    expect(
      FORGOTTEN_WORKOUT_SESSIONS_MONITOR.checkinMarginMinutes
    ).toBeGreaterThanOrEqual(15);
  });

  it("stops starting closes before the function's time limit, which the monitor's runtime covers", () => {
    const maxDuration =
      vercel.functions["api/forgotten-workout-sessions.js"]?.maxDuration ?? 0;

    expect(RUN_BUDGET_MS).toBeLessThan(maxDuration * 1000);
    expect(
      FORGOTTEN_WORKOUT_SESSIONS_MONITOR.maxRuntimeMinutes * 60
    ).toBeGreaterThan(maxDuration);
  });
});
