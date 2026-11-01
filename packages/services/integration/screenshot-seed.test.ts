import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { weeklyGoalOverview } from "@fitme/core/weekly-goals";
import {
  asUser,
  personalRecordInitializations,
  personalRecords,
  plans,
  profiles,
  weeklyGoalChanges,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessionProgress,
  workoutSessions,
  workouts,
} from "@fitme/db";
import { localAdminDatabaseUrl } from "@fitme/db/local-database-url";
import { sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { getExerciseHistory } from "../src/exercises";
import { initializePersonalRecords } from "../src/personal-records";
import { previewPlanUpdate } from "../src/plan-update";
import { getWeeklyGoals } from "../src/weekly-goals";
import {
  addSetToWorkoutSessionExercise,
  finishWorkoutSession,
  getWorkoutSession,
  listWorkoutSessions,
} from "../src/workout-sessions";
import { deleteTestUsers } from "./delete-test-users";

const owner = `user_screenshot${randomUUID().replaceAll("-", "")}`;
const other = `user_screenshot${randomUUID().replaceAll("-", "")}`;
const tables = {
  personalRecordInitializations,
  personalRecords,
  plans,
  profiles,
  weeklyGoalChanges,
  workoutExerciseSets,
  workoutExercises,
  workoutSessionExerciseSets,
  workoutSessionExercises,
  workoutSessionProgress,
  workoutSessions,
  workouts,
};

afterAll(() => deleteTestUsers([owner, other]));

const seed = (userId: string, open: string | null = "off", now?: string) => {
  const source = readFileSync(
    new URL("../../../marketing/screenshots/seed/seed.sql", import.meta.url),
    "utf8"
  );
  execFileSync(
    "psql",
    [
      "-X",
      localAdminDatabaseUrl(),
      "-v",
      `user_id=${userId}`,
      ...(open === null ? [] : ["-v", `open_session=${open}`]),
      "-f",
      "-",
    ],
    {
      // A fixed clock in the test input only; the actual seed always uses now().
      input: now ? source.replaceAll("now()", `'${now}'::timestamptz`) : source,
      stdio: "pipe",
    }
  );
};

// Core charts use the device's local Date fields. Model a Madrid device even
// when CI's process clock uses UTC (including midnight and DST boundaries).
const madridClock = (instant: string | Date): Date => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Madrid",
    year: "numeric",
  }).formatToParts(new Date(instant));
  const part = (name: string) =>
    Number(parts.find(({ type }) => type === name)?.value);
  return new Date(part("year"), part("month") - 1, part("day"), 12);
};

const snapshot = (userId: string) =>
  asUser(userId, async (tx) => {
    const result: Record<string, unknown[]> = {};
    for (const [name, table] of Object.entries(tables)) {
      // biome-ignore lint/performance/noAwaitInLoops: one transaction connection
      const rows = await tx.execute<{ row: unknown }>(
        sql`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`
      );
      result[name] = rows.rows.map(({ row }) => row);
    }
    return result;
  });

const initialize = (userId: string) =>
  asUser(userId, (tx) => initializePersonalRecords(tx, userId));

it("seeds repeatable, isolated screenshot History and a finish worth two PRs", async () => {
  seed(other);
  await initialize(other);
  const untouched = await snapshot(other);

  seed(owner);
  await initialize(owner);
  const first = await snapshot(owner);
  expect(await initialize(owner)).toEqual({ alreadyInitialized: true });
  expect(await snapshot(owner)).toEqual(first);
  const counts = (rows: Record<string, unknown[]>) =>
    Object.fromEntries(
      Object.entries(rows).map(([name, all]) => [name, all.length])
    );
  expect(first.workoutSessions.length).toBeGreaterThanOrEqual(36);
  const covers = await asUser(owner, (tx) =>
    tx.select({ cover: workouts.cover }).from(workouts)
  );
  expect(covers.map(({ cover }) => cover).sort()).toEqual(
    [
      "09dbfdc3-e5e3-40b7-af50-130feb180fa2",
      "1efd6fb2-a9eb-4801-b0ad-a1b4ac95d840",
      "44aee640-9c3d-497b-8522-278bcae654e2",
      "c14716d5-1355-4ae7-a997-2c06414487de",
    ].sort()
  );
  seed(owner);
  await initialize(owner);
  expect(counts(await snapshot(owner))).toEqual(counts(first));
  expect(await snapshot(other)).toEqual(untouched);

  const history = await asUser(owner, (tx) =>
    listWorkoutSessions(tx, { limit: 50, offset: 0, status: "all" })
  );
  expect(history.sessions.every((session) => session.finished_at)).toBe(true);
  const rowHistory = await asUser(owner, (tx) =>
    getExerciseHistory(tx, owner, {
      exerciseSlug: "barbell-bent-over-row",
      limit: 50,
    })
  );
  const rowWeights = [...rowHistory]
    .reverse()
    .map((entry) => Math.max(...entry.sets.map((set) => set.weight_completed)));
  expect(rowWeights.length).toBeGreaterThanOrEqual(9);
  expect(rowWeights).toEqual([...rowWeights].sort((a, b) => a - b));
  expect(rowWeights.at(-1)).toBeGreaterThan(rowWeights[0]);
  expect(
    history.sessions.some((session) => session.personal_records.length >= 2)
  ).toBe(true);
  // The API deliberately bounds real streaks by its October 31 release.
  // Its existing historical-fixture seam lets this local seed prove its data.
  const goals = await asUser(owner, (tx) =>
    getWeeklyGoals(
      tx,
      owner,
      "Europe/Madrid",
      new Date(),
      new Date("2020-01-01")
    )
  );
  expect(goals.changes.map((change) => change.target)).toEqual([4]);
  expect(goals.streak).toBeGreaterThanOrEqual(9);
  const overview = weeklyGoalOverview(
    goals.changes.map((change) => ({
      ...change,
      recorded_at: madridClock(change.recorded_at).toISOString(),
    })),
    history.sessions.map((session) => ({
      ...session,
      started_at: madridClock(session.started_at).toISOString(),
    })),
    madridClock(new Date())
  );
  expect(overview?.weeks).toHaveLength(8);
  expect(
    overview?.weeks.every((week) => week.kind === "tracked" && week.goal === 4)
  ).toBe(true);
  expect(overview?.hitWeeks).toBe(7);

  seed(owner, "on");
  await initialize(owner);
  const open = await asUser(owner, (tx) =>
    listWorkoutSessions(tx, { limit: 50, offset: 0, status: "in_progress" })
  );
  expect(open.sessions).toHaveLength(1);
  const sessionId = open.sessions[0].id;
  const detail = await asUser(owner, (tx) => getWorkoutSession(tx, sessionId));
  expect(
    detail?.exercises
      .flatMap((exercise) => exercise.sets)
      .filter((set) => set.logged_at)
  ).toHaveLength(7);
  const bench = detail?.exercises.find(
    (exercise) => exercise.exercise_slug === "bench-press-flat-barbell"
  );
  expect(bench).toBeDefined();
  // Exercise the documented shot-07 action through the real app service.
  await asUser(owner, (tx) =>
    addSetToWorkoutSessionExercise(tx, owner, {
      repsCompleted: 6,
      sessionExerciseId: bench?.id ?? "",
      weightCompleted: 82.5,
    })
  );
  await asUser(owner, (tx) => finishWorkoutSession(tx, sessionId));
  const update = await asUser(owner, (tx) =>
    previewPlanUpdate(tx, owner, sessionId)
  );
  expect(update?.changes).toEqual([
    {
      exercise_slug: "bench-press-flat-barbell",
      kind: "add_sets",
      sets: [{ reps: 6, weight: 82.5 }],
    },
  ]);
  const finished = await asUser(owner, (tx) =>
    listWorkoutSessions(tx, { limit: 50, offset: 0, status: "all" })
  );
  expect(
    finished.sessions.find((session) => session.id === sessionId)
      ?.personal_records.length
  ).toBeGreaterThanOrEqual(2);
  expect(await snapshot(other)).toEqual(untouched);
}, 60_000);

it.each([
  ["2026-10-26T00:05:00+01:00", 0],
  ["2026-10-27T00:05:00+01:00", 1],
  ["2026-10-28T00:05:00+01:00", 2],
  ["2026-10-29T00:05:00+01:00", 2],
  ["2026-10-30T00:05:00+01:00", 3],
  ["2026-10-31T00:05:00+01:00", 4],
  ["2026-11-01T00:05:00+01:00", 4],
])(
  "keeps nine complete weeks and no future finishes at %s",
  async (now, currentCount) => {
    seed(owner, null, now);
    const history = await asUser(owner, (tx) =>
      listWorkoutSessions(tx, {
        limit: 50,
        offset: 0,
        status: "finished",
      })
    );
    expect(history.total).toBe(36 + currentCount);
    expect(
      history.sessions.every(
        (session) => new Date(session.finished_at ?? 0) < new Date(now)
      )
    ).toBe(true);
    const chronological = [...history.sessions].reverse();
    const rotation = ["Upper A", "Lower A", "Upper B", "Lower B"];
    expect(chronological.at(-1)?.workout?.name).toBe("Lower B");
    for (let index = 1; index < chronological.length; index += 1) {
      const previous = rotation.indexOf(
        chronological[index - 1].workout?.name ?? ""
      );
      expect(chronological[index].workout?.name).toBe(
        rotation[(previous + 1) % 4]
      );
    }
    const goals = await asUser(owner, (tx) =>
      getWeeklyGoals(
        tx,
        owner,
        "Europe/Madrid",
        new Date(now),
        new Date("2020-01-01")
      )
    );
    expect(goals.streak).toBe(currentCount === 4 ? 10 : 9);
    const open = await asUser(owner, (tx) =>
      listWorkoutSessions(tx, {
        limit: 50,
        offset: 0,
        status: "in_progress",
      })
    );
    expect(open.sessions).toHaveLength(1); // omitted open_session defaults to on
  }
);
