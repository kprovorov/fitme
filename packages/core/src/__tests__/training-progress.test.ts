import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  monthlyTotals,
  type ProgressSession,
  qualifiesForProgress,
} from "../training-progress";

// Kyiv moves its clocks forward on 29 March 2026 (03:00 → 04:00) and back on
// 25 October 2026 (04:00 → 03:00); Node reads TZ again when it changes.
const originalTimeZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Kyiv";
});
afterAll(() => {
  // Assigning `undefined` would set the string "undefined", read as UTC.
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

const HOUR_MS = 3_600_000;

const session = (
  startedAt: string,
  finishedAt: string | null,
  overrides: Partial<ProgressSession> = {}
): ProgressSession => ({
  completed_rep_count: 10,
  finished_at: finishedAt,
  started_at: startedAt,
  volume: 100,
  ...overrides,
});

describe("qualifiesForProgress", () => {
  it("takes a finished session with reps", () => {
    expect(
      qualifiesForProgress(
        session("2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z")
      )
    ).toBe(true);
  });

  it("leaves out an open session and an empty completion", () => {
    expect(qualifiesForProgress(session("2026-10-01T10:00:00Z", null))).toBe(
      false
    );
    expect(
      qualifiesForProgress(
        session("2026-10-01T10:00:00Z", "2026-10-01T11:00:00Z", {
          completed_rep_count: 0,
        })
      )
    ).toBe(false);
  });
});

describe("monthlyTotals", () => {
  // Friday 30 October 2026, noon in Kyiv.
  const now = new Date("2026-10-30T10:00:00Z");

  it("sums the month's qualifying sessions: count, full elapsed time and volume", () => {
    const totals = monthlyTotals(
      [
        session("2026-10-05T07:00:00Z", "2026-10-05T08:15:00Z", {
          volume: 1250.5,
        }),
        session("2026-10-02T07:00:00Z", "2026-10-02T07:45:00Z", {
          volume: 980.25,
        }),
      ],
      now
    );

    expect(totals).toEqual({
      elapsedMs: 2 * HOUR_MS,
      volume: 2230.75,
      workouts: 2,
    });
  });

  it("leaves out empty completions, open sessions and other months", () => {
    const totals = monthlyTotals(
      [
        session("2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z", {
          completed_rep_count: 0,
          volume: 0,
        }),
        session("2026-10-29T07:00:00Z", null),
        session("2026-09-29T07:00:00Z", "2026-09-29T08:00:00Z"),
        session("2025-10-15T07:00:00Z", "2025-10-15T08:00:00Z"),
      ],
      now
    );

    expect(totals).toEqual({ elapsedMs: 0, volume: 0, workouts: 0 });
  });

  it("attributes a session to its local start date, with its whole duration", () => {
    // Starts 23:30 on 30 September in Kyiv (20:30 UTC), finishes on 1 October.
    const lateStart = session("2026-09-30T20:30:00Z", "2026-09-30T22:00:00Z");
    // Starts 00:30 on 1 November in Kyiv: November, though still 31 October in UTC.
    const earlyStart = session("2026-10-31T22:30:00Z", "2026-10-31T23:30:00Z");
    // Starts 23:00 on 31 October in Kyiv, finishes in November: October's.
    const acrossMonths = session(
      "2026-10-31T21:00:00Z",
      "2026-10-31T23:30:00Z"
    );

    expect(monthlyTotals([lateStart, earlyStart, acrossMonths], now)).toEqual({
      elapsedMs: 2.5 * HOUR_MS,
      volume: 100,
      workouts: 1,
    });
    expect(
      monthlyTotals(
        [lateStart, earlyStart, acrossMonths],
        new Date("2026-09-15T10:00:00Z")
      )
    ).toEqual({ elapsedMs: 1.5 * HOUR_MS, volume: 100, workouts: 1 });
  });

  it("measures elapsed time across a daylight-saving change, not wall clock", () => {
    // 02:30 → 05:30 on the wall in Kyiv on 25 October, when 04:00 happens twice: 4 h.
    const totals = monthlyTotals(
      [session("2026-10-24T23:30:00Z", "2026-10-25T03:30:00Z")],
      now
    );

    expect(totals.elapsedMs).toBe(4 * HOUR_MS);
  });
});
