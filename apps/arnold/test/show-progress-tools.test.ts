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
  offeredTo,
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

const { default: getLifetimeTotals } =
  await import("../agent/tools/get_lifetime_totals");

const { default: getWeeklyGoal } =
  await import("../agent/tools/get_weekly_goal");

const { default: showExerciseHistoryEntry, tool: showExerciseHistory } =
  await import("../agent/tools/show_exercise_history");

const { default: showLifetimeTotalsEntry, tool: showLifetimeTotals } =
  await import("../agent/tools/show_lifetime_totals");

const { default: showWeeklyGoalEntry, tool: showWeeklyGoal } =
  await import("../agent/tools/show_weekly_goal");

const tx = { fake: "transaction" };

const alice = contextFor("user_alice");

/** A model call from a build that can draw exactly `cards`. */
const drawing = (cards: string[]) =>
  withClientContext(alice, { cards, language: "en" });

// A model might slip numbers into a card's input; none may reach the answer.
const numberFields = {
  count: 99,
  date: "2026-01-01",
  duration_seconds: 1,
  limit: 10,
  streak: 52,
  volume: 1_000_000,
  weight: 500,
  workout_count: 999,
};

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

const summary = (id: string, startedAt: string): WorkoutSessionSummary => ({
  completed_rep_count: 10,
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
  profile.lockProfileUnits.mockResolvedValue({ height: "in", weight: "lbs" });
  testLibrary.reset();
  observability.reportError.mockResolvedValue(undefined);
};

describe.each([
  [
    "show_exercise_history",
    showExerciseHistoryEntry,
    showExerciseHistory,
    "exercise_history",
  ],
  ["show_weekly_goal", showWeeklyGoalEntry, showWeeklyGoal, "weekly_goal"],
  [
    "show_lifetime_totals",
    showLifetimeTotalsEntry,
    showLifetimeTotals,
    "lifetime_totals",
  ],
] as const)("%s's offer", (_name, entryPoint, tool, card) => {
  beforeEach(setUp);

  it("is offered to a build that can draw its card", async () => {
    await expect(
      offeredTo(entryPoint, drawing(["workout", card]))
    ).resolves.toBe(tool);
  });

  it("isn't offered to a build without its card, nor to an old build", async () => {
    await expect(
      offeredTo(entryPoint, drawing(["workout", "plan"]))
    ).resolves.toBeNull();
    await expect(
      offeredTo(entryPoint, withClientContext(alice, { language: "en" }))
    ).resolves.toBeNull();
    await expect(offeredTo(entryPoint, alice)).resolves.toBeNull();
  });
});

describe("show_exercise_history", () => {
  beforeEach(() => {
    setUp();
    exercises.getExerciseHistory.mockResolvedValue({
      entries: [
        entry("open", null, [historySet("s0", 12, 100)]),
        ...Array.from({ length: 6 }, (_, index) =>
          entry(`done_${index}`, "2026-11-13T10:00:00Z", [
            historySet(`s${index + 1}`, 8, 80 - index),
            historySet(`b${index + 1}`, 15, null),
          ])
        ),
      ],
      total: 7,
    });
  });

  it("answers what get_exercise_history answers for the slug, unit included", async () => {
    const ctx = withClientContext(alice, {
      cards: ["exercise_history"],
      language: "uk",
    });

    const shown = await showExerciseHistory.execute(
      inputSchemaOf(showExerciseHistory).parse({
        exercise_slug: "bench-press",
      }),
      ctx
    );

    const read = await getExerciseHistory.execute(
      inputSchemaOf(getExerciseHistory).parse({ exercise_slug: "bench-press" }),
      ctx
    );

    expect(shown).toStrictEqual(read);
    expect(shown).toMatchObject({
      best_result: { reps: 8, weight: 80 },
      name: "Жим лежачи",
      total: 7,
      weight_unit: "lbs",
    });
    expect(shown).toHaveProperty("entries.length", 5);
    expect(db.asUser).toHaveBeenCalledWith("user_alice", expect.any(Function));
  });

  it("answers an Exercise the User hasn't logged as a card with no entries", async () => {
    exercises.getExerciseHistory.mockResolvedValue({ entries: [], total: 0 });

    await expect(
      showExerciseHistory.execute({ exercise_slug: "back-squat" }, alice)
    ).resolves.toStrictEqual({
      best_result: null,
      entries: [],
      exercise_slug: "back-squat",
      name: "Back Squat",
      total: 0,
      weight_unit: "lbs",
    });
  });

  it("takes an old slug the Library still maps to its replacement", async () => {
    await expect(
      showExerciseHistory.execute(
        { exercise_slug: "barbell-bench-press" },
        alice
      )
    ).resolves.toMatchObject({
      exercise_slug: "barbell-bench-press",
      name: "Bench Press",
    });
  });

  it("throws for a slug the Library doesn't know, reading nothing", async () => {
    await expect(
      showExerciseHistory.execute({ exercise_slug: "jefferson-curl" }, alice)
    ).rejects.toThrow("Unknown exercise_slug: jefferson-curl");
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("throws when the Library can't load, reading nothing", async () => {
    testLibrary.reset({ loads: "fail" });

    await expect(
      showExerciseHistory.execute({ exercise_slug: "bench-press" }, alice)
    ).rejects.toThrow("The exercise library is unavailable right now");
    expect(db.asUser).not.toHaveBeenCalled();
  });

  it("takes only a slug: no number, date or User id", () => {
    expect(
      inputSchemaOf(showExerciseHistory).parse({
        exercise_slug: "bench-press",
        ...numberFields,
        ...userIdFields,
      })
    ).toStrictEqual({ exercise_slug: "bench-press" });
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      showExerciseHistory.execute(
        { exercise_slug: "bench-press" },
        contextFor(null)
      )
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("show_weekly_goal", () => {
  // Wednesday 2026-11-25, noon UTC.
  const NOW = new Date("2026-11-25T12:00:00Z");

  beforeEach(() => {
    setUp();
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    weeklyGoals.getWeeklyGoals.mockResolvedValue({
      changes: [{ recorded_at: "2026-11-02T00:00:00Z", target: 3 }],
      streak: 2,
    });
    sessions.listWorkoutSessions.mockResolvedValue({
      sessions: [
        summary("monday", "2026-11-23T15:00:00Z"),
        summary("late-sunday", "2026-11-23T04:30:00Z"),
      ],
      total: 2,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answers what get_weekly_goal answers, in the device's time zone", async () => {
    const ctx = withClientContext(alice, {
      cards: ["weekly_goal"],
      language: "en",
      timeZone: "America/New_York",
    });

    const shown = await showWeeklyGoal.execute({}, ctx);

    expect(shown).toStrictEqual(await getWeeklyGoal.execute({}, ctx));
    expect(shown).toMatchObject({
      goal: 3,
      streak: 2,
      this_week: { count: 1, goal: 3, hit: false },
      time_zone: "America/New_York",
    });
    expect(shown).toHaveProperty("weeks.length", 8);
  });

  it("throws without an active Plan, reading no sessions", async () => {
    weeklyGoals.getWeeklyGoals.mockResolvedValue({
      changes: [
        { recorded_at: "2026-11-02T00:00:00Z", target: 3 },
        { recorded_at: "2026-11-20T00:00:00Z", target: null },
      ],
      streak: 0,
    });

    await expect(showWeeklyGoal.execute({}, alice)).rejects.toThrow(
      "No active plan, so the user has no Weekly goal"
    );
    expect(sessions.listWorkoutSessions).not.toHaveBeenCalled();
  });

  it("takes nothing: no number, date or User id", () => {
    expect(
      inputSchemaOf(showWeeklyGoal).parse({ ...numberFields, ...userIdFields })
    ).toStrictEqual({});
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(showWeeklyGoal.execute({}, contextFor(null))).rejects.toThrow(
      "This Conversation has no signed-in owner"
    );
    expect(db.asUser).not.toHaveBeenCalled();
  });
});

describe("show_lifetime_totals", () => {
  beforeEach(setUp);

  it("answers what get_lifetime_totals answers, unit included", async () => {
    lifetime.getLifetimeTotals.mockResolvedValue({
      duration_seconds: 7200,
      volume: 27_500,
      weight_unit: "lbs",
      workout_count: 3,
    });

    const shown = await showLifetimeTotals.execute({}, alice);

    expect(shown).toStrictEqual(await getLifetimeTotals.execute({}, alice));
    expect(shown).toStrictEqual({
      duration_seconds: 7200,
      volume: 27_500,
      weight_unit: "lbs",
      workout_count: 3,
    });
    expect(lifetime.getLifetimeTotals).toHaveBeenCalledWith(tx, "user_alice");
  });

  it("answers zeros as a card for a User who hasn't trained", async () => {
    const zeros = {
      duration_seconds: 0,
      volume: 0,
      weight_unit: "kg" as const,
      workout_count: 0,
    };

    lifetime.getLifetimeTotals.mockResolvedValue(zeros);

    await expect(showLifetimeTotals.execute({}, alice)).resolves.toStrictEqual(
      zeros
    );
  });

  it("takes nothing: no number, date or User id", () => {
    expect(
      inputSchemaOf(showLifetimeTotals).parse({
        ...numberFields,
        ...userIdFields,
      })
    ).toStrictEqual({});
  });

  it("refuses to run without a Clerk User owning the session", async () => {
    await expect(
      showLifetimeTotals.execute({}, contextFor(null))
    ).rejects.toThrow("This Conversation has no signed-in owner");
    expect(db.asUser).not.toHaveBeenCalled();
  });
});
