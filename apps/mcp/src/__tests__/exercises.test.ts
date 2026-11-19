import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import type { LibraryV2 } from "../library.js";
import type { UserServices } from "../services.js";
import {
  BENCH,
  bundleExercise,
  call,
  connectWithServices,
  LIBRARY_OUTAGE,
  recordingReporter,
  SESSION_ID,
  TEST_SUPABASE_URL,
  testLibrary,
} from "./harness.js";
import type { ToolOutcome } from "./harness.js";

const UNAVAILABLE = "Library unavailable, try again.";

const MEDIA = `${TEST_SUPABASE_URL}/storage/v1`;

/** The media URLs an Exercise from the harness's bundle is served with. */
const mediaOf = (slug: string) => ({
  thumbnail_url: `${MEDIA}/render/image/public/library/${slug}/${"a".repeat(64)}.webp`,
  video_url: `${MEDIA}/object/public/library/${slug}/${"b".repeat(64)}.mp4`,
});

/** BENCH as a list row answers it. */
const BENCH_ROW = {
  difficulty: "intermediate",
  equipment: ["barbell", "bench"],
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  name: "Bench Press",
  secondary_muscle_groups: ["triceps", "shoulders"],
  slug: "bench-press",
  ...mediaOf("bench-press"),
};

const SQUAT_ROW = {
  difficulty: "intermediate",
  equipment: ["barbell"],
  movement_patterns: ["squat"],
  muscle_groups: ["quadriceps", "glutes"],
  name: "Barbell Back Squat",
  secondary_muscle_groups: ["core"],
  slug: "barbell-back-squat",
  ...mediaOf("barbell-back-squat"),
};

/** A made-up Exercise, named from its number, needing no gear. */
const drill = (n: number) => {
  const id = String(n).padStart(3, "0");

  return bundleExercise(`drill-${id}`, `Drill ${id}`, {
    muscle_groups: ["core"],
  });
};

/** Chest Exercises, each tagged with the Equipment it needs. */
const DUMBBELL_PRESS = bundleExercise(
  "dumbbell-bench-press",
  "Dumbbell Bench Press",
  { equipment: ["dumbbell", "bench"] }
);

const CABLE_FLY = bundleExercise("cable-fly", "Cable Fly", {
  equipment: ["cable"],
  movement_patterns: ["isolation"],
});

const PUSH_UP = bundleExercise("push-up", "Push Up");

/** Bodyweight on a bar: a User with no bar shouldn't get it. */
const PULL_UP = bundleExercise("pull-up", "Pull Up", {
  equipment: ["bodyweight", "pull_up_bar"],
  movement_patterns: ["pull"],
  muscle_groups: ["back"],
  secondary_muscle_groups: ["biceps"],
});

/** An Exercise that trains the chest only as a secondary muscle group. */
const DIP = bundleExercise("parallel-bar-dips", "Parallel Bar Dips", {
  equipment: ["bodyweight", "parallel_bars"],
  muscle_groups: ["triceps"],
  secondary_muscle_groups: ["chest"],
});

const slugsOf = (json: ToolOutcome["json"]) =>
  // SAFETY: list_exercises answers rows that each carry a string slug.
  (json.exercises as { slug: string }[]).map((row) => row.slug);

/** A failure as Drizzle throws it: the SQL in the message, Postgres as the cause. */
const queryFailure = (message: string) =>
  new DrizzleQueryError(
    'select "id" from "workout_session_exercises"',
    [],
    Object.assign(new Error(message), { code: "57014" })
  );

describe("list_exercises", () => {
  it("answers each row with its difficulty, movement patterns and both muscle group lists", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "list_exercises");

    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual({
      exercises: [SQUAT_ROW, BENCH_ROW],
      hasMore: false,
      limit: 20,
      offset: 0,
      total: 2,
    });
  });

  it("searches the name and the other names, trimmed and case-insensitive", async () => {
    const client = await connectWithServices({});

    const byName = await call(client, "list_exercises", { search: "  BENCH " });
    const byAlias = await call(client, "list_exercises", { search: "flat" });

    expect(slugsOf(byName.json)).toStrictEqual([BENCH.slug]);
    expect(slugsOf(byAlias.json)).toStrictEqual([BENCH.slug]);
  });

  it("filters by a new primary muscle group only", async () => {
    const library = testLibrary({ exercises: [BENCH, DIP, PULL_UP] });
    const client = await connectWithServices({}, undefined, library);

    const chest = await call(client, "list_exercises", {
      muscleGroup: "chest",
    });

    // the dips train the chest only as a secondary group
    expect(slugsOf(chest.json)).toStrictEqual([BENCH.slug]);

    const back = await call(client, "list_exercises", { muscleGroup: "back" });

    expect(slugsOf(back.json)).toStrictEqual([PULL_UP.slug]);
  });

  it("filters by the new Equipment, matching any of the values, with the muscle group and search", async () => {
    const library = testLibrary({
      exercises: [DUMBBELL_PRESS, CABLE_FLY, PUSH_UP, PULL_UP],
    });

    const client = await connectWithServices({}, undefined, library);

    const result = await call(client, "list_exercises", {
      equipment: ["dumbbell", "cable"],
      muscleGroup: "chest",
      search: "press",
    });

    // the cable fly uses one of the values but is no "press", the push up neither
    expect(slugsOf(result.json)).toStrictEqual([DUMBBELL_PRESS.slug]);

    const withBar = await call(client, "list_exercises", {
      equipment: ["pull_up_bar"],
    });

    expect(slugsOf(withBar.json)).toStrictEqual([PULL_UP.slug]);
  });

  it("pages over the whole Library, up to the maximum page", async () => {
    const drills = Array.from({ length: 120 }, (_, i) => drill(i));
    const library = testLibrary({ exercises: drills });
    const client = await connectWithServices({}, undefined, library);

    const result = await call(client, "list_exercises", {
      limit: 100,
      offset: 5,
    });

    expect(result.json).toMatchObject({
      hasMore: true,
      limit: 100,
      offset: 5,
      total: 120,
    });

    const slugs = slugsOf(result.json);

    expect(slugs).toHaveLength(100);
    expect(slugs[0]).toBe("drill-005");
    expect(slugs.at(-1)).toBe("drill-104");
  });

  it("returns an empty last page with the total when the offset is past the end", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "list_exercises", { offset: 40 });

    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual({
      exercises: [],
      hasMore: false,
      limit: 20,
      offset: 40,
      total: 2,
    });
  });

  it("rejects a page size over the maximum and a legacy or unknown muscle group, unreported", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices({}, reportError);

    const tooMany = await call(client, "list_exercises", { limit: 101 });

    expect(tooMany.isError).toBeTruthy();

    // `abs` is a Legacy Library group the new Library doesn't have
    const legacy = await call(client, "list_exercises", { muscleGroup: "abs" });

    const unknown = await call(client, "list_exercises", {
      muscleGroup: "wings",
    });

    expect(legacy.isError).toBeTruthy();
    expect(unknown.isError).toBeTruthy();
    expect(reported).toStrictEqual([]);
  });

  it("rejects Equipment that isn't a list of known values, unreported", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices({}, reportError);

    const unknownEquipment = await call(client, "list_exercises", {
      equipment: ["jetpack"],
    });

    expect(unknownEquipment.isError).toBeTruthy();

    const equipmentString = await call(client, "list_exercises", {
      equipment: "dumbbell",
    });

    expect(equipmentString.isError).toBeTruthy();

    const tooMuchEquipment = await call(client, "list_exercises", {
      equipment: Array.from({ length: 50 }, () => "dumbbell"),
    });

    expect(tooMuchEquipment.isError).toBeTruthy();
    expect(reported).toStrictEqual([]);
  });

  it("fails and reports when the bundle can't load, then loads it on the next call", async () => {
    const { reportError, reported } = recordingReporter();
    const down = testLibrary({ loads: "fail", reportError });
    const up = testLibrary({ reportError });
    let asks = 0;

    const flaky: LibraryV2 = {
      get: () => {
        asks += 1;

        return asks === 1 ? down.get() : up.get();
      },
    };

    const client = await connectWithServices({}, reportError, flaky);

    const failed = await call(client, "list_exercises");

    expect(failed.isError).toBeTruthy();
    expect(failed.text).toBe(UNAVAILABLE);
    expect(reported).toStrictEqual([LIBRARY_OUTAGE]);

    const retried = await call(client, "list_exercises");

    expect(retried.isError).toBeFalsy();
    expect(retried.json).toMatchObject({ total: 2 });
  });
});

describe("get_exercise", () => {
  it("returns the Exercise in full: the summary, descriptions, steps, mistakes and benefits", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "get_exercise", {
      exerciseSlug: BENCH.slug,
    });

    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual({
      ...BENCH_ROW,
      benefits: ["Bench Press builds strength."],
      common_mistakes: ["Rushing the bench press."],
      long_description: "Bench Press, described at length.",
      short_description: "Bench Press in a line.",
      steps: ["Set up for the bench press.", "Lift.", "Lower."],
    });
  });

  it("answers an old slug with the Exercise replacing it", async () => {
    const library = testLibrary({
      replacedSlugs: { "barbell-bench-press": BENCH.slug },
    });

    const client = await connectWithServices({}, undefined, library);

    const result = await call(client, "get_exercise", {
      exerciseSlug: "barbell-bench-press",
    });

    expect(result.isError).toBeFalsy();
    expect(result.json).toMatchObject({
      name: "Bench Press",
      slug: BENCH.slug,
    });
  });

  it("errors when no Exercise has the slug", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "get_exercise", {
      exerciseSlug: "nope-press",
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toBe(
      "Exercise nope-press not found. Use list_exercises to look up valid Exercise slugs."
    );
  });

  it("fails and reports when the bundle can't load", async () => {
    const { reportError, reported } = recordingReporter();

    const client = await connectWithServices(
      {},
      reportError,
      testLibrary({ loads: "fail", reportError })
    );

    const result = await call(client, "get_exercise", {
      exerciseSlug: BENCH.slug,
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toBe(UNAVAILABLE);
    expect(reported).toStrictEqual([LIBRARY_OUTAGE]);
  });

  it("rejects an exerciseId instead of an exerciseSlug", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "get_exercise", {
      exerciseId: "55555555-5555-4555-8555-555555555555",
    });

    expect(result.isError).toBeTruthy();
  });
});

describe("get_exercise_history", () => {
  const entry = {
    finished_at: "2026-10-01T11:00:00+00:00",
    plan: { id: "plan", name: "Plan" },
    session_exercise_id: "wse-1",
    session_id: SESSION_ID,
    sets: [
      {
        id: "s1",
        logged_at: null,
        order: 1,
        reps_completed: 8,
        reps_recommended: 8,
        weight_completed: 75,
        weight_recommended: 70,
      },
      {
        id: "s2",
        logged_at: null,
        order: 2,
        reps_completed: 6,
        reps_recommended: 6,
        weight_completed: 80,
        weight_recommended: 75,
      },
    ],
    started_at: "2026-10-01T10:00:00+00:00",
    workout: { id: "workout", name: "Day A" },
  };

  /** A pull-up session: logged reps, no weight, and no targets. */
  const bodyweightEntry = {
    ...entry,
    session_exercise_id: "wse-2",
    sets: [
      {
        id: "s3",
        logged_at: "2026-10-02T10:05:00+00:00",
        order: 1,
        reps_completed: 12,
        reps_recommended: null,
        weight_completed: null,
        weight_recommended: null,
      },
    ],
  };

  it("returns the service's entries for the Exercise slug, with the total", async () => {
    const getExerciseHistory = vi
      .fn<UserServices["getExerciseHistory"]>()
      .mockResolvedValue({ entries: [entry], total: 1 });

    const client = await connectWithServices({ getExerciseHistory });

    const result = await call(client, "get_exercise_history", {
      exerciseSlug: BENCH.slug,
      limit: 3,
    });

    expect(getExerciseHistory).toHaveBeenCalledWith({
      exerciseSlug: BENCH.slug,
      limit: 3,
      offset: 0,
    });
    expect(result.isError).toBeFalsy();
    expect(result.json).toStrictEqual({
      entries: [entry],
      exerciseSlug: BENCH.slug,
      total: 1,
    });
  });

  it("returns a bodyweight set, with no weight and its set targets", async () => {
    const getExerciseHistory = vi
      .fn<UserServices["getExerciseHistory"]>()
      .mockResolvedValue({ entries: [bodyweightEntry, entry], total: 2 });

    const client = await connectWithServices({ getExerciseHistory });

    const result = await call(client, "get_exercise_history", {
      exerciseSlug: BENCH.slug,
    });

    // the bodyweight set is there with no weight, and every set its targets
    expect(result.json).toStrictEqual({
      entries: [bodyweightEntry, entry],
      exerciseSlug: BENCH.slug,
      total: 2,
    });
  });

  it("asks for 10 entries by default and rejects more than 50", async () => {
    const getExerciseHistory = vi
      .fn<UserServices["getExerciseHistory"]>()
      .mockResolvedValue({ entries: [], total: 0 });

    const client = await connectWithServices({ getExerciseHistory });

    const result = await call(client, "get_exercise_history", {
      exerciseSlug: BENCH.slug,
    });

    expect(result.json).toStrictEqual({
      entries: [],
      exerciseSlug: BENCH.slug,
      total: 0,
    });

    const tooMany = await call(client, "get_exercise_history", {
      exerciseSlug: BENCH.slug,
      limit: 51,
    });

    expect(tooMany.isError).toBeTruthy();
    expect(getExerciseHistory).toHaveBeenCalledExactlyOnceWith({
      exerciseSlug: BENCH.slug,
      limit: 10,
      offset: 0,
    });
  });

  it("reports database errors as tool errors without the SQL", async () => {
    const client = await connectWithServices({
      getExerciseHistory: () => Promise.reject(queryFailure("deadlock")),
    });

    const result = await call(client, "get_exercise_history", {
      exerciseSlug: BENCH.slug,
    });

    expect(result.isError).toBeTruthy();
    expect(result.text).toBe("deadlock");
  });
});
