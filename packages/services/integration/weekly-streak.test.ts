import { randomUUID } from "node:crypto";
import {
  asUser,
  plans,
  weeklyGoalChanges,
  withService,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessions,
} from "@fitme/db";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getWeeklyGoals } from "../src/weekly-goals";
import { deleteTestUsers } from "./delete-test-users";

const users: string[] = [];
afterAll(() => deleteTestUsers(users));

const seed = async (
  changes: [string, number | null][],
  sessions: { start: string; reps?: number; open?: boolean }[]
) => {
  const userId = `user_streak${randomUUID().replaceAll("-", "")}`;
  users.push(userId);
  await withService(async (tx) => {
    if (changes.length) {
      await tx.insert(weeklyGoalChanges).values(
        changes.map(([recordedAt, target]) => ({
          recordedAt,
          target,
          userId,
        }))
      );
    }
    const ownedPlans = await tx
      .insert(plans)
      .values([
        {
          deletedAt: "2026-10-30T00:00:00Z",
          frequency: 1,
          goal: "strength",
          name: "Earlier plan",
          place: "gym",
          userId,
        },
        {
          frequency: 2,
          goal: "strength",
          isActive: true,
          name: "Current plan",
          place: "gym",
          userId,
        },
      ])
      .returning();
    let index = 0;
    for (const { start, reps = 8, open = false } of sessions) {
      // biome-ignore lint/performance/noAwaitInLoops: one statement at a time on tx
      const [session] = await tx
        .insert(workoutSessions)
        .values({
          finishedAt: open
            ? null
            : new Date(Date.parse(start) + 3_600_000).toISOString(),
          planId: ownedPlans[index % 2].id,
          startedAt: start,
          userId,
        })
        .returning();
      index += 1;
      const [exercise] = await tx
        .insert(workoutSessionExercises)
        .values({
          exerciseSlug: "test-streak",
          order: 1,
          workoutSessionId: session.id,
        })
        .returning();
      await tx.insert(workoutSessionExerciseSets).values(
        [1, 2].map((order) => ({
          order,
          repsCompleted: reps,
          workoutSessionExerciseId: exercise.id,
        }))
      );
    }
  });
  return userId;
};

const read = (userId: string, now: string, timeZone = "Europe/Kyiv") =>
  asUser(userId, (tx) => getWeeklyGoals(tx, userId, timeZone, new Date(now)));

interface PlanNode {
  "Actual Loops": number;
  "Actual Rows": number;
  "Node Type": string;
  Plans?: PlanNode[];
  "Relation Name"?: string;
  "Rows Removed by Filter"?: number;
}

const planNodes = (node: PlanNode): PlanNode[] => [
  node,
  ...(node.Plans ?? []).flatMap(planNodes),
];

describe("Weekly streaks from retained goals and finished training", () => {
  it.each([
    ["GMT+1", "2026-11-01T23:00:00Z"],
    ["GMT+05:30", "2026-11-01T18:30:00Z"],
    ["GMT-03:30", "2026-11-02T03:30:00Z"],
    ["UTC+12:45", "2026-11-01T11:15:00Z"],
  ])("keeps the local Monday boundary for %s", async (zone, monday) => {
    const user = await seed(
      [["2026-10-19T12:00:00Z", 1]],
      [{ start: "2026-10-20T12:00:00Z" }]
    );
    const beforeMonday = new Date(Date.parse(monday) - 1).toISOString();
    expect((await read(user, beforeMonday, zone)).streak).toBe(1);
    expect((await read(user, monday, zone)).streak).toBe(0);
  });

  it("stops in SQL at the first missed week without reading distant occupied weeks", async () => {
    const user = await seed([["1800-01-01T10:00:00Z", 1]], []);
    await withService((tx) =>
      tx.execute(sql`
      with sessions as (
        insert into ${workoutSessions} (user_id, started_at, finished_at)
        select ${user}, '1900-01-02T12:00:00Z'::timestamptz + i * interval '1 week',
          '1900-01-02T13:00:00Z'::timestamptz + i * interval '1 week'
        from generate_series(0, 999) as i returning id
      ), exercises as (
        insert into ${workoutSessionExercises} (workout_session_id, exercise_slug, "order")
        select id, 'test-streak', 1 from sessions returning id
      )
      insert into ${workoutSessionExerciseSets} (workout_session_exercise_id, "order", reps_completed)
      select id, 1, 8 from exercises
    `)
    );
    await asUser(user, async (tx) => {
      const execute = vi.spyOn(tx, "execute");
      expect(
        (
          await getWeeklyGoals(
            tx,
            user,
            "UTC",
            new Date("2026-10-28T12:00:00Z")
          )
        ).streak
      ).toBe(0);
      const [[query]] = execute.mock.calls;
      execute.mockRestore();
      const explained = await tx.execute<{
        "QUERY PLAN": { Plan: PlanNode }[];
      }>(sql`explain (analyze, format json) ${query}`);
      const nodes = planNodes(explained.rows[0]["QUERY PLAN"][0].Plan);
      const sessionReads = nodes.filter(
        (node) => node["Relation Name"] === "workout_sessions"
      );
      expect(sessionReads.length).toBeGreaterThan(0);
      expect(
        sessionReads.reduce(
          (total, node) =>
            total +
            (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) *
              node["Actual Loops"],
          0
        ),
        JSON.stringify(sessionReads)
      ).toBeLessThanOrEqual(2);
    });
  });
  it.each(["0001-01-01T00:00:00Z", "-infinity"])(
    "bounds reads by recorded training with a caller-chosen %s goal timestamp",
    async (recordedAt) => {
      const user = await seed(
        [["2026-10-01T10:00:00Z", 1]],
        [{ start: "2026-10-20T10:00:00Z" }]
      );
      // The exposed Data API's authenticated INSERT permission permits this.
      await asUser(user, (tx) =>
        tx
          .insert(weeklyGoalChanges)
          .values({ recordedAt, target: 1, userId: user })
      );
      const result = await asUser(user, async (tx) => {
        // Keep this regression safe even against the old range-expanding query.
        await tx.execute(sql`set local statement_timeout = '1s'`);
        return getWeeklyGoals(
          tx,
          user,
          "Europe/Kyiv",
          new Date("2026-10-28T12:00:00Z")
        );
      });
      expect(result.streak).toBe(1);
    }
  );

  it("reads a streak longer than the chart, preserves it through Sunday and resets next Monday", async () => {
    const starts = Array.from({ length: 11 }, (_, index) => {
      const date = new Date("2026-08-11T10:00:00Z");
      date.setUTCDate(date.getUTCDate() + index * 7);
      return { start: date.toISOString() };
    });
    const user = await seed([["2026-08-05T10:00:00Z", 1]], starts);
    // Eleven successful completed weeks; current week remains pending.
    expect((await read(user, "2026-11-01T21:59:59Z")).streak).toBe(11);
    // Fresh transaction/device read, same persisted result.
    expect((await read(user, "2026-11-01T21:59:59Z")).streak).toBe(11);
    expect((await read(user, "2026-11-01T22:00:00Z")).streak).toBe(0);
  });

  it("extends immediately on current-week success, using retained targets across changes", async () => {
    const user = await seed(
      [
        ["2026-10-06T10:00:00Z", 1],
        ["2026-10-21T10:00:00Z", 2],
      ],
      [
        { start: "2026-10-07T10:00:00Z" },
        { start: "2026-10-13T10:00:00Z" },
        { start: "2026-10-20T10:00:00Z" },
        { start: "2026-10-27T10:00:00Z" },
        { start: "2026-10-28T10:00:00Z" },
      ]
    );
    expect((await read(user, "2026-10-28T12:00:00Z")).streak).toBe(4);
  });

  it("breaks neutrally across unknown weeks instead of joining successes across a gap", async () => {
    const user = await seed(
      [
        ["2026-10-06T10:00:00Z", 1],
        ["2026-10-14T10:00:00Z", null],
        ["2026-10-21T10:00:00Z", 1],
      ],
      [
        { start: "2026-10-07T10:00:00Z" },
        { start: "2026-10-13T10:00:00Z" },
        { start: "2026-10-20T10:00:00Z" },
        { start: "2026-10-27T10:00:00Z" },
      ]
    );
    expect((await read(user, "2026-10-25T12:00:00Z")).streak).toBe(2);
    expect((await read(user, "2026-10-26T12:00:00Z")).streak).toBe(0);
    expect((await read(user, "2026-10-28T12:00:00Z")).streak).toBe(1);
  });

  it("allows a first partial week to start a streak and spares its miss", async () => {
    const hit = await seed(
      [["2026-10-21T10:00:00Z", 1]],
      [{ start: "2026-10-22T10:00:00Z" }]
    );
    expect((await read(hit, "2026-10-23T10:00:00Z")).streak).toBe(1);
    const missed = await seed(
      [["2026-10-21T10:00:00Z", 1]],
      [{ start: "2026-10-27T10:00:00Z" }]
    );
    expect((await read(missed, "2026-10-28T10:00:00Z")).streak).toBe(1);
  });

  it("uses local start weeks through DST, counts sessions once, and excludes open/empty sessions", async () => {
    const user = await seed(
      [["2026-10-05T00:00:00+03:00", 1]],
      [
        // Starts Sunday in Kyiv, finishes Monday; belongs to the previous week.
        { start: "2026-10-25T23:30:00+02:00" },
        { reps: 0, start: "2026-10-27T10:00:00Z" },
        { open: true, start: "2026-10-28T10:00:00Z" },
      ]
    );
    expect((await read(user, "2026-10-28T12:00:00Z")).streak).toBe(1);
    // At this instant it is already Monday in Kyiv, but still Sunday in LA.
    expect(
      (await read(user, "2026-11-01T22:00:00Z", "America/Los_Angeles")).streak
    ).toBe(1);
    expect((await read(user, "2026-11-01T22:00:00Z")).streak).toBe(0);
  });

  it("hides progress without an active goal and isolates Users", async () => {
    const user = await seed(
      [
        ["2026-10-21T10:00:00Z", 1],
        ["2026-10-28T10:00:00Z", null],
      ],
      [{ start: "2026-10-22T10:00:00Z" }]
    );
    expect((await read(user, "2026-10-29T12:00:00Z")).streak).toBe(0);
    const intruder = await seed([], []);
    expect(
      await asUser(intruder, (tx) =>
        getWeeklyGoals(
          tx,
          user,
          "Europe/Kyiv",
          new Date("2026-10-29T12:00:00Z")
        )
      )
    ).toEqual({ changes: [], streak: 0 });
  });
});
