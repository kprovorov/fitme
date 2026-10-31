import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProgressSession } from "../training-progress";
import {
  type GoalWeek,
  startOfGoalWeek,
  type WeeklyGoalChange,
  weeklyGoalOverview,
} from "../weekly-goals";

// Kyiv moves its clocks back on Sunday 25 October 2026 (04:00 → 03:00): the
// week of 19 October is 169 hours long. Node reads TZ again when it changes.
const originalTimeZone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "Europe/Kyiv";
});
afterAll(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

/** Wednesday 28 October 2026, noon in Kyiv. */
const NOW = new Date("2026-10-28T12:00:00+02:00");

/** A local Kyiv time, with its offset (EEST until 25 October, then EET). */
const at = (local: string) =>
  new Date(
    `${local}${local < "2026-10-25T04" ? "+03:00" : "+02:00"}`
  ).toISOString();

const change = (local: string, target: number | null): WeeklyGoalChange => ({
  recorded_at: at(local),
  target,
});

const workout = (
  startLocal: string,
  overrides: Partial<ProgressSession> = {}
): ProgressSession => ({
  completed_rep_count: 10,
  finished_at: new Date(
    new Date(at(startLocal)).getTime() + 3_600_000
  ).toISOString(),
  started_at: at(startLocal),
  volume: 100,
  ...overrides,
});

const overview = (
  changes: WeeklyGoalChange[],
  sessions: ProgressSession[] = []
) => {
  const result = weeklyGoalOverview(changes, sessions, NOW);
  if (!result) {
    throw new Error("Expected a Weekly goal overview");
  }
  return result;
};

/** Each week as `<Monday>: <kind> <goal>`, oldest first. */
const goals = (weeks: GoalWeek[]) =>
  weeks.map(
    (week) =>
      `${week.start.getDate()}.${week.start.getMonth() + 1} ${week.kind} ${week.goal}`
  );

describe("startOfGoalWeek", () => {
  it("is the Monday 00:00 the date falls in, Sunday included", () => {
    expect(startOfGoalWeek(new Date(at("2026-10-25T23:59"))).getTime()).toBe(
      new Date(at("2026-10-19T00:00")).getTime()
    );
    expect(startOfGoalWeek(new Date(at("2026-10-26T00:00"))).getTime()).toBe(
      new Date(at("2026-10-26T00:00")).getTime()
    );
  });
});

describe("weeklyGoalOverview", () => {
  it("fully tracks the first week when tracking starts exactly Monday midnight", () => {
    const result = overview(
      [change("2026-10-19T00:00", 3)],
      [
        workout("2026-10-20T10:00"),
        workout("2026-10-21T10:00"),
        workout("2026-10-22T10:00"),
      ]
    );

    expect(result.weeks.at(-2)).toMatchObject({
      count: 3,
      goal: 3,
      hit: true,
      kind: "tracked",
    });
    expect(result.eligibleWeeks).toBe(1);
    expect(result.hitWeeks).toBe(1);
  });

  it("has nothing to show without an active Plan", () => {
    expect(weeklyGoalOverview([], [], NOW)).toBeNull();
    expect(
      weeklyGoalOverview(
        [change("2026-09-01T10:00", 3), change("2026-10-27T10:00", null)],
        [],
        NOW
      )
    ).toBeNull();
  });

  it("shows seven previous weeks and this one, Monday to Sunday", () => {
    const { weeks } = overview([change("2026-08-01T10:00", 3)]);

    expect(weeks.map((week) => week.start.toDateString())).toEqual([
      "Mon Sep 07 2026",
      "Mon Sep 14 2026",
      "Mon Sep 21 2026",
      "Mon Sep 28 2026",
      "Mon Oct 05 2026",
      "Mon Oct 12 2026",
      "Mon Oct 19 2026",
      "Mon Oct 26 2026",
    ]);
    expect(weeks.map((week) => week.current)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("starts tracking with a partial week and invents no goal before it", () => {
    const { weeks } = overview([change("2026-10-07T18:00", 4)]);

    expect(goals(weeks)).toEqual([
      "7.9 unknown null",
      "14.9 unknown null",
      "21.9 unknown null",
      "28.9 unknown null",
      "5.10 firstPartial 4",
      "12.10 tracked 4",
      "19.10 tracked 4",
      "26.10 tracked 4",
    ]);
  });

  it("keeps a week's goal and applies a change from the following Monday", () => {
    const { goal, weeks } = overview([
      change("2026-08-01T10:00", 3),
      change("2026-10-14T09:00", 5),
      // At Monday 00:00 sharp: the week has begun, so it waits a week too
      change("2026-10-19T00:00", 2),
      // This week's change waits for next Monday
      change("2026-10-27T20:00", 6),
    ]);

    expect(goals(weeks).slice(-4)).toEqual([
      "5.10 tracked 3",
      "12.10 tracked 3",
      "19.10 tracked 5",
      "26.10 tracked 2",
    ]);
    // The goal shown is this week's, not next week's
    expect(goal).toBe(2);
  });

  it("leaves weeks begun without an active Plan unknown", () => {
    const { goal, weeks } = overview([
      change("2026-08-01T10:00", 3),
      change("2026-09-16T10:00", null),
      change("2026-09-30T10:00", 4),
      change("2026-10-21T10:00", null),
      change("2026-10-27T10:00", 5),
    ]);

    expect(goals(weeks)).toEqual([
      "7.9 tracked 3",
      "14.9 tracked 3",
      "21.9 unknown null",
      "28.9 unknown null",
      "5.10 tracked 4",
      "12.10 tracked 4",
      "19.10 tracked 4",
      "26.10 unknown null",
    ]);
    // This week has no goal yet: the active Plan's is shown
    expect(goal).toBe(5);
  });

  it("counts qualifying Workout Sessions by the week they started in", () => {
    const { weeks } = overview(
      [change("2026-08-01T10:00", 3)],
      [
        // Sunday night, finished on Monday: the week it started in
        workout("2026-10-18T23:30"),
        workout("2026-10-19T00:10"),
        // The extra hour of 25 October still belongs to that week
        workout("2026-10-25T23:30"),
        workout("2026-10-26T00:00"),
        // An empty completion and an open session earn nothing
        workout("2026-10-20T10:00", { completed_rep_count: 0 }),
        workout("2026-10-27T10:00", { finished_at: null }),
        // Before the chart
        workout("2026-09-06T23:59"),
      ]
    );

    expect(weeks.map((week) => week.count)).toEqual([0, 0, 0, 0, 0, 1, 2, 1]);
  });

  it("counts only completed, fully tracked weeks toward the weeks hit", () => {
    const sessions = [
      // 5 October: the first partial week, hit
      workout("2026-10-07T19:00"),
      workout("2026-10-08T19:00"),
      // 12 October: missed (1 of 2)
      workout("2026-10-13T19:00"),
      // 19 October: over the goal (3 of 2)
      workout("2026-10-19T19:00"),
      workout("2026-10-21T19:00"),
      workout("2026-10-23T19:00"),
      // This week: hit already, but still running
      workout("2026-10-26T19:00"),
      workout("2026-10-27T19:00"),
    ];
    const result = overview([change("2026-10-07T18:00", 2)], sessions);

    expect(
      result.weeks
        .slice(-4)
        .map(({ count, hit, kind }) => ({ count, hit, kind }))
    ).toEqual([
      { count: 2, hit: true, kind: "firstPartial" },
      { count: 1, hit: false, kind: "tracked" },
      { count: 3, hit: true, kind: "tracked" },
      { count: 2, hit: true, kind: "tracked" },
    ]);
    expect(result.eligibleWeeks).toBe(2);
    expect(result.hitWeeks).toBe(1);
  });

  it("has no eligible week before a full week was tracked", () => {
    const result = overview(
      [change("2026-10-20T18:00", 3)],
      [workout("2026-09-08T19:00")]
    );

    expect(result.eligibleWeeks).toBe(0);
    expect(result.hitWeeks).toBe(0);
    // An unknown week shows its count, but nothing is judged
    expect(result.weeks[0]).toMatchObject({
      count: 1,
      goal: null,
      hit: false,
      kind: "unknown",
    });
  });
});
