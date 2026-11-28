import type * as Db from "@fitme/db";
import type * as Observability from "@fitme/observability/node";
import type * as ExerciseServices from "@fitme/services/exercises";
import type { ExerciseHistoryEntry } from "@fitme/services/exercises";
import type * as LifetimeServices from "@fitme/services/lifetime-totals";
import type * as ProfileServices from "@fitme/services/profile";
import type * as WeeklyGoalServices from "@fitme/services/weekly-goals";
import type * as SessionServices from "@fitme/services/workout-sessions";
import type { WorkoutSessionSummary } from "@fitme/services/workout-sessions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as LibraryModule from "../agent/lib/library";
import { testLibrary } from "./library";
import {
  contextFor,
  inputSchemaOf,
  userIdFields,
  withClientContext,
} from "./tool-context";

type ReadTransaction = (transaction: typeof tx) => Promise<unknown>;

const db = vi.hoisted(() => ({
  asUser: vi.fn<(userId: string, fn: ReadTransaction) => Promise<unknown>>(),
}));

const exercises = vi.hoisted(() => ({
  getExerciseHistory: vi.fn<typeof ExerciseServices.getExerciseHistory>(),
}));

const profile = vi.hoisted(() => ({
  lockProfileUnits: vi.fn<typeof ProfileServices.lockProfileUnits>(),
}));

const lifetime = vi.hoisted(() => ({
  getLifetimeTotals: vi.fn<typeof LifetimeServices.getLifetimeTotals>(),
}));

const weeklyGoals = vi.hoisted(() => ({
  getWeeklyGoals: vi.fn<typeof WeeklyGoalServices.getWeeklyGoals>(),
}));

const sessions = vi.hoisted(() => ({
  listWorkoutSessions: vi.fn<typeof SessionServices.listWorkoutSessions>(),
}));

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Db | typeof db>(import("@fitme/db"), () => db);

vi.mock<typeof ExerciseServices>(
  import("@fitme/services/exercises"),
  () => exercises
);

vi.mock<typeof ProfileServices | typeof profile>(
  import("@fitme/services/profile"),
  () => profile
);

vi.mock<typeof LifetimeServices>(
  import("@fitme/services/lifetime-totals"),
  () => lifetime
);

vi.mock<typeof WeeklyGoalServices | typeof weeklyGoals>(
  import("@fitme/services/weekly-goals"),
  () => weeklyGoals
);

vi.mock<typeof SessionServices | typeof sessions>(
  import("@fitme/services/workout-sessions"),
  () => sessions
);

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

vi.mock<typeof LibraryModule>(import("../agent/lib/library"), async () => {
  const { testLibrary: library } = await import("./library");

  return { getLibrary: () => library.get() };
});

const { default: getExerciseHistory } =
  await import("../agent/tools/get_exercise_history");

const { BEST_RESULT_ENTRIES } = await import("../agent/lib/exercise-history");

const { default: getLifetimeTotals } =
  await import("../agent/tools/get_lifetime_totals");

const { default: getWeeklyGoal } =
  await import("../agent/tools/get_weekly_goal");

const { SESSION_PAGE_SIZE } = await import("../agent/lib/weekly-goal");

const tx = { fake: "transaction" };

const alice = contextFor("user_alice");

const historySet = (
  id: string,
  reps: number,
  weight: number | null
): ExerciseHistoryEntry["sets"][number] => ({
  id,
  logged_at: "2026-11-20T10:00:00Z",
  note: null,
  order: 1,
  reps_completed: reps,
  reps_recommended: 8,
  weight_completed: weight,
  weight_recommended: 60,
});

const entry = (
  id: string,
  finishedAt: string | null,
  sets: ExerciseHistoryEntry["sets"]
): ExerciseHistoryEntry => ({
  finished_at: finishedAt,
  plan: { id: "plan_1", name: "Push pull" },
  session_exercise_id: `wse_${id}`,
  session_id: `session_${id}`,
  sets,
  started_at: "2026-11-20T09:00:00Z",
  workout: { id: "workout_1", name: "Push" },
});

const summary = (
  id: string,
  startedAt: string,
  completedReps = 10
): WorkoutSessionSummary => ({
  completed_rep_count: completedReps,
  exercise_count: 1,
  finished_at: startedAt,
  id,
  logged_set_count: 1,
  personal_records: [],
  plan: null,
  set_count: 1,
  started_at: startedAt,
  status: "finished",
  volume: 100,
  workout: null,
});

const setUp = () => {
  db.asUser.mockImplementation(async (_userId, fn) => await fn(tx));
  profile.lockProfileUnits.mockResolvedValue({ height: "cm", weight: "kg" });
  testLibrary.reset();
  observability.reportError.mockResolvedValue(undefined);
};

describe("get_exercise_history", () => {
  beforeEach(setUp);

  it("answers the recent entries, the best result and the unit as the session's User", async () => {
    exercises.getExerciseHistory.mockResolvedValue({
      entries: [
        // Still open: shown, but not part of the best result.
        entry("open", null, [historySet("s0", 12, 100)]),
        entry("b", "2026-11-20T10:00:00Z", [
          historySet("s1", 8, 80),
          historySet("s2", 6, 80),
        ]),
        entry("a", "2026-11-13T10:00:00Z", [historySet("s3", 10, 70)]),
      ],
      total: 3,
    });

    const input = inputSchemaOf(getExerciseHistory).parse({
      exercise_slug: "bench-press",
      limit: 2,
    });

    const result = await getExerciseHistory.execute(
      input,
      withClientContext(alice, { language: "uk" })
    );

    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(profile.lockProfileUnits).toHaveBeenCalledWith(tx, "user_alice");
    expect(exercises.getExerciseHistory).toHaveBeenCalledWith(
      tx,
      "user_alice",
      { exerciseSlug: "bench-press", limit: BEST_RESULT_ENTRIES, offset: 0 }
    );
    expect(result).toStrictEqual({
      best_result: { reps: 8, weight: 80 },
      entries: [
        {
          id: "wse_open",
          session: {
            finished_at: null,
            id: "session_open",
            started_at: "2026-11-20T09:00:00Z",
          },
          sets: [
            {
              id: "s0",
              note: null,
              order: 1,
              reps_completed: 12,
              reps_recommended: 8,
              weight_completed: 100,
              weight_recommended: 60,
            },
          ],
        },
        {
          id: "wse_b",
          session: {
            finished_at: "2026-11-20T10:00:00Z",
            id: "session_b",
            started_at: "2026-11-20T09:00:00Z",
          },
          sets: [
            {
              id: "s1",
              note: null,
              order: 1,
              reps_completed: 8,
              reps_recommended: 8,
              weight_completed: 80,
              weight_recommended: 60,
            },
            {
              id: "s2",
              note: null,
              order: 1,
              reps_completed: 6,
              reps_recommended: 8,
              weight_completed: 80,
              weight_recommended: 60,
            },
          ],
        },
      ],
      exercise_slug: "bench-press",
      name: "Жим лежачи",
      total: 3,
      weight_unit: "kg",
    });
  });

  it("answers an empty list, no best result and the Profile's unit with no history", async () => {
    profile.lockProfileUnits.mockResolvedValue({ height: "in", weight: "lbs" });
    exercises.getExerciseHistory.mockResolvedValue({ entries: [], total: 0 });

    await expect(
      getExerciseHistory.execute(
        { exercise_slug: "back-squat", limit: 5 },
        alice
      )
    ).resolves.toStrictEqual({
      best_result: null,
      entries: [],
      exercise_slug: "back-squat",
      name: "Back Squat",
      total: 0,
      weight_unit: "lbs",
    });
  });

  it("names an Exercise from its slug when the Library doesn't know it or can't load", async () => {
    profile.lockProfileUnits.mockResolvedValue(null);
    exercises.getExerciseHistory.mockResolvedValue({ entries: [], total: 0 });

    await expect(
      getExerciseHistory.execute(
        { exercise_slug: "jefferson-curl", limit: 5 },
        alice
      )
    ).resolves.toMatchObject({ name: "Jefferson curl", weight_unit: "kg" });

    testLibrary.reset({ loads: "fail" });

    await expect(
      getExerciseHistory.execute(
        { exercise_slug: "bench-press", limit: 5 },
        alice
      )
    ).resolves.toMatchObject({ name: "Bench press" });
  });

  it("defaults to 5 entries and takes no User id", () => {
    expect(
      inputSchemaOf(getExerciseHistory).parse({
        exercise_slug: "bench-press",
        ...userIdFields,
      })
    ).toStrictEqual({ exercise_slug: "bench-press", limit: 5 });
    expect(() =>
      inputSchemaOf(getExerciseHistory).parse({
        exercise_slug: "bench-press",
        limit: 11,
      })
    ).toThrow("Too big");
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      getExerciseHistory.execute(
        { exercise_slug: "bench-press", limit: 5 },
        contextFor(null)
      )
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("get_lifetime_totals", () => {
  beforeEach(setUp);

  it("answers the totals as the session's User", async () => {
    const totals = {
      duration_seconds: 7200,
      volume: 12_500,
      weight_unit: "kg" as const,
      workout_count: 3,
    };

    lifetime.getLifetimeTotals.mockResolvedValue(totals);

    const input = inputSchemaOf(getLifetimeTotals).parse(userIdFields);

    await expect(
      getLifetimeTotals.execute(input, alice)
    ).resolves.toStrictEqual(totals);
    expect(input).toStrictEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(lifetime.getLifetimeTotals).toHaveBeenCalledWith(tx, "user_alice");
  });

  it("answers zeros for a User who hasn't trained", async () => {
    const zeros = {
      duration_seconds: 0,
      volume: 0,
      weight_unit: "kg" as const,
      workout_count: 0,
    };

    lifetime.getLifetimeTotals.mockResolvedValue(zeros);

    await expect(getLifetimeTotals.execute({}, alice)).resolves.toStrictEqual(
      zeros
    );
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      getLifetimeTotals.execute({}, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("get_weekly_goal", () => {
  // Wednesday 2026-11-25, noon UTC.
  const NOW = new Date("2026-11-25T12:00:00Z");

  beforeEach(() => {
    setUp();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    weeklyGoals.getWeeklyGoals.mockResolvedValue({
      changes: [{ recorded_at: "2026-11-02T00:00:00Z", target: 3 }],
      streak: 2,
    });
    sessions.listWorkoutSessions.mockResolvedValue({ sessions: [], total: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts a late Sunday session in its own week in the device's time zone", async () => {
    // Sunday 2026-11-22, 23:30 in New York: Monday 04:30 in UTC.
    sessions.listWorkoutSessions.mockResolvedValue({
      sessions: [
        summary("monday", "2026-11-23T15:00:00Z"),
        summary("late-sunday", "2026-11-23T04:30:00Z"),
      ],
      total: 2,
    });

    const result = await getWeeklyGoal.execute(
      {},
      withClientContext(alice, {
        language: "en",
        timeZone: "America/New_York",
      })
    );

    expect(weeklyGoals.getWeeklyGoals).toHaveBeenCalledWith(
      tx,
      "user_alice",
      "America/New_York",
      NOW
    );
    expect(result).toMatchObject({
      goal: 3,
      streak: 2,
      this_week: { count: 1, goal: 3, hit: false },
      time_zone: "America/New_York",
    });

    const weeks = "weeks" in result && result.weeks ? result.weeks : [];

    expect(weeks).toHaveLength(8);
    expect(weeks.at(-1)).toStrictEqual({
      count: 1,
      current: true,
      goal: 3,
      hit: false,
      kind: "tracked",
      start: "2026-11-23T05:00:00.000Z",
    });
    expect(weeks.at(-2)).toMatchObject({
      count: 1,
      start: "2026-11-16T05:00:00.000Z",
    });
  });

  it("counts in UTC without a time zone from the client", async () => {
    sessions.listWorkoutSessions.mockResolvedValue({
      sessions: [summary("late-sunday", "2026-11-23T04:30:00Z")],
      total: 1,
    });

    const result = await getWeeklyGoal.execute({}, alice);

    expect(weeklyGoals.getWeeklyGoals).toHaveBeenCalledWith(
      tx,
      "user_alice",
      "UTC",
      NOW
    );
    expect(result).toMatchObject({
      this_week: { count: 1 },
      time_zone: "UTC",
    });
  });

  it("reads finished sessions page by page until they're older than the weeks shown", async () => {
    const fullPage = Array.from({ length: SESSION_PAGE_SIZE }, (_, index) =>
      summary(`recent_${index}`, "2026-11-24T10:00:00Z")
    );

    sessions.listWorkoutSessions
      .mockResolvedValueOnce({ sessions: fullPage, total: 120 })
      .mockResolvedValueOnce({
        sessions: [
          ...fullPage.slice(1),
          summary("old", "2026-01-05T10:00:00Z"),
        ],
        total: 120,
      });

    await getWeeklyGoal.execute({}, alice);

    expect(sessions.listWorkoutSessions.mock.calls).toStrictEqual([
      [tx, { limit: SESSION_PAGE_SIZE, offset: 0, status: "finished" }],
      [
        tx,
        {
          limit: SESSION_PAGE_SIZE,
          offset: SESSION_PAGE_SIZE,
          status: "finished",
        },
      ],
    ]);
  });

  it("says so without an active Plan, reading no sessions", async () => {
    weeklyGoals.getWeeklyGoals.mockResolvedValue({
      changes: [
        { recorded_at: "2026-11-02T00:00:00Z", target: 3 },
        { recorded_at: "2026-11-20T00:00:00Z", target: null },
      ],
      streak: 0,
    });

    await expect(getWeeklyGoal.execute({}, alice)).resolves.toStrictEqual({
      error: "No active plan, so the user has no Weekly goal",
    });
    expect(sessions.listWorkoutSessions).not.toHaveBeenCalled();
  });

  it("takes no User id and acts only as the Conversation's owner", async () => {
    const input = inputSchemaOf(getWeeklyGoal).parse(userIdFields);

    await getWeeklyGoal.execute(input, contextFor("user_alice", "user_bob"));

    expect(input).toStrictEqual({});
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
    expect(JSON.stringify(db.asUser.mock.calls)).not.toContain("user_mallory");
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(getWeeklyGoal.execute({}, contextFor(null))).rejects.toThrow(
      "This Conversation has no signed-in owner"
    );
    expect(db.asUser).not.toHaveBeenCalled();
  });
});
