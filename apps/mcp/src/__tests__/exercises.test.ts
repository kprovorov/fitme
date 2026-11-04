import type {
  Exercise,
  Library,
  ListExercisesParams,
} from "@fitme/library-sdk";
import { LibraryUnavailableError } from "@fitme/library-sdk";
import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { ToolError } from "../tools/helpers.js";
import {
  BENCH,
  call,
  connect,
  connectWithServices,
  contextFor,
  fakeLibrary,
  fakeServices,
  recordingReporter,
  SESSION_ID,
  SQUAT,
} from "./harness.js";

const UNAVAILABLE = "Library unavailable, try again.";

const summary = ({ description: _, instructions: __, ...rest }: Exercise) =>
  rest;

/** A made-up Exercise, named from its slug, needing no gear. */
const drill = (n: number): Exercise => ({
  ...BENCH,
  equipment: ["bodyweight"],
  muscle_groups: ["cardio"],
  name: `Drill ${String(n).padStart(3, "0")}`,
  slug: `drill-${String(n).padStart(3, "0")}`,
});

/** Chest Exercises, each tagged with the Equipment it needs. */
const DUMBBELL_PRESS: Exercise = {
  ...BENCH,
  equipment: ["dumbbell", "bench"],
  name: "Dumbbell Bench Press",
  slug: "dumbbell-bench-press",
};
const CABLE_FLY: Exercise = {
  ...BENCH,
  equipment: ["cable"],
  name: "Cable Fly",
  slug: "cable-fly",
};
const PUSH_UP: Exercise = {
  ...BENCH,
  equipment: ["bodyweight"],
  name: "Push Up",
  slug: "push-up",
};

/** A library over `exercises` recording every list call. */
const spiedLibrary = (exercises: Exercise[]) => {
  const library = fakeLibrary(exercises);
  const lists: ListExercisesParams[] = [];
  const spied: Library = {
    ...library,
    list: (params = {}) => {
      lists.push(params);
      return library.list(params);
    },
  };
  return { library: spied, lists };
};

const downLibrary = () => {
  const library = fakeLibrary();
  library.failWith(new LibraryUnavailableError({ status: 503 }));
  return library;
};

/** A failure as Drizzle throws it: the SQL in the message, Postgres as the cause. */
const queryFailure = (message: string) =>
  new DrizzleQueryError(
    'select "id" from "workout_session_exercises"',
    [],
    Object.assign(new Error(message), { code: "57014" })
  );

describe("list_exercises", () => {
  it("searches the library with the trimmed search, muscle group and page", async () => {
    const press = { ...BENCH, name: "Overhead Press", slug: "overhead-press" };
    const incline = {
      ...BENCH,
      name: "Incline Bench Press",
      slug: "incline-bench-press",
    };
    const { library, lists } = spiedLibrary([BENCH, SQUAT, press, incline]);
    const client = await connectWithServices({}, undefined, library);

    const result = await call(client, "list_exercises", {
      limit: 1,
      muscleGroup: "chest",
      offset: 1,
      search: "  PRESS  ",
    });

    expect(lists).toEqual([
      { limit: 1, muscleGroup: "chest", offset: 1, search: "PRESS" },
    ]);
    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      exercises: [summary(incline)],
      hasMore: true,
      limit: 1,
      offset: 1,
      total: 3,
    });
  });

  it("filters by Equipment, matching any of the values, with the muscle group and search", async () => {
    const { library, lists } = spiedLibrary([
      DUMBBELL_PRESS,
      CABLE_FLY,
      PUSH_UP,
      SQUAT,
    ]);
    const client = await connectWithServices({}, undefined, library);

    const result = await call(client, "list_exercises", {
      equipment: ["dumbbell", "cable"],
      muscleGroup: "chest",
      search: "press",
    });

    expect(lists).toEqual([
      {
        equipment: ["dumbbell", "cable"],
        limit: 20,
        muscleGroup: "chest",
        offset: 0,
        search: "press",
      },
    ]);
    // the cable fly uses one of the values but is no "press", the push up neither
    expect(result.json).toEqual({
      exercises: [summary(DUMBBELL_PRESS)],
      hasMore: false,
      limit: 20,
      offset: 0,
      total: 1,
    });
  });

  it("answers each row's Equipment next to its muscle groups", async () => {
    const client = await connectWithServices(
      {},
      undefined,
      fakeLibrary([DUMBBELL_PRESS, PUSH_UP])
    );

    const result = await call(client, "list_exercises");

    expect(result.json.exercises).toEqual([
      expect.objectContaining({
        equipment: ["dumbbell", "bench"],
        muscle_groups: ["chest", "triceps"],
        slug: DUMBBELL_PRESS.slug,
      }),
      expect.objectContaining({
        equipment: ["bodyweight"],
        slug: PUSH_UP.slug,
      }),
    ]);
  });

  it("asks for the first page of 20 by default", async () => {
    const { library, lists } = spiedLibrary([BENCH, SQUAT]);
    const client = await connectWithServices({}, undefined, library);

    const result = await call(client, "list_exercises");

    expect(lists).toEqual([{ limit: 20, offset: 0 }]);
    expect(result.json).toEqual({
      exercises: [summary(SQUAT), summary(BENCH)],
      hasMore: false,
      limit: 20,
      offset: 0,
      total: 2,
    });
  });

  it("reads a page over the API's 50 in two parts", async () => {
    const drills = Array.from({ length: 120 }, (_, i) => drill(i));
    const { library, lists } = spiedLibrary(drills);
    const client = await connectWithServices({}, undefined, library);

    const result = await call(client, "list_exercises", {
      limit: 100,
      offset: 5,
    });

    expect(lists).toEqual([
      { limit: 50, offset: 5 },
      { limit: 50, offset: 55 },
    ]);
    expect(result.json).toMatchObject({
      hasMore: true,
      limit: 100,
      offset: 5,
      total: 120,
    });
    const slugs = (result.json.exercises as { slug: string }[]).map(
      (e) => e.slug
    );
    expect(slugs).toHaveLength(100);
    expect(slugs[0]).toBe("drill-005");
    expect(slugs.at(-1)).toBe("drill-104");
  });

  it("sends the Equipment filter on both parts of a page over the API's 50", async () => {
    const drills = Array.from({ length: 120 }, (_, i) => drill(i));
    const { library, lists } = spiedLibrary([...drills, DUMBBELL_PRESS]);
    const client = await connectWithServices({}, undefined, library);

    const result = await call(client, "list_exercises", {
      equipment: ["bodyweight"],
      limit: 100,
      offset: 5,
    });

    expect(lists).toEqual([
      { equipment: ["bodyweight"], limit: 50, offset: 5 },
      { equipment: ["bodyweight"], limit: 50, offset: 55 },
    ]);
    // the dumbbell press is filtered out of both parts and of the total
    expect(result.json).toMatchObject({
      hasMore: true,
      limit: 100,
      offset: 5,
      total: 120,
    });
    expect(result.json.exercises).toHaveLength(100);
  });

  it("answers the last page when it ends inside the first part", async () => {
    const drills = Array.from({ length: 30 }, (_, i) => drill(i));
    const client = await connectWithServices(
      {},
      undefined,
      fakeLibrary(drills)
    );

    const result = await call(client, "list_exercises", { limit: 100 });

    expect(result.json).toMatchObject({ hasMore: false, total: 30 });
    expect(result.json.exercises).toHaveLength(30);
  });

  it("reports one failure when a two-part page fails", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices({}, reportError, downLibrary());

    const result = await call(client, "list_exercises", { limit: 100 });

    expect(result.text).toBe(UNAVAILABLE);
    expect(reported).toHaveLength(1);
  });

  it("returns an empty last page with the total when the offset is past the end", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "list_exercises", { offset: 40 });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      exercises: [],
      hasMore: false,
      limit: 20,
      offset: 40,
      total: 2,
    });
  });

  it("rejects a page size over the maximum, an unknown muscle group and unknown Equipment, unreported", async () => {
    const { library, lists } = spiedLibrary([BENCH]);
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices({}, reportError, library);

    expect((await call(client, "list_exercises", { limit: 101 })).isError).toBe(
      true
    );
    expect(
      (await call(client, "list_exercises", { muscleGroup: "wings" })).isError
    ).toBe(true);
    expect(
      (await call(client, "list_exercises", { equipment: ["kettlebell"] }))
        .isError
    ).toBe(true);
    expect(
      (await call(client, "list_exercises", { equipment: "dumbbell" })).isError
    ).toBe(true);
    // more values than there are, so no caller can build a query the API rejects
    expect(
      (
        await call(client, "list_exercises", {
          equipment: Array.from({ length: 50 }, () => "dumbbell"),
        })
      ).isError
    ).toBe(true);
    expect(lists).toEqual([]);
    expect(reported).toEqual([]);
  });

  it("fails and reports when the library is unavailable", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices({}, reportError, downLibrary());

    const result = await call(client, "list_exercises");

    expect(result.isError).toBe(true);
    expect(result.text).toBe(UNAVAILABLE);
    expect(reported).toEqual([expect.any(LibraryUnavailableError)]);
  });

  it("says so, unreported, when the library isn't configured", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connect({
      ...contextFor(fakeServices({}), reportError),
      getLibrary: () => {
        throw new ToolError("Not configured for the Library.");
      },
    });

    const result = await call(client, "list_exercises");

    expect(result.isError).toBe(true);
    expect(result.text).toBe("Not configured for the Library.");
    expect(reported).toEqual([]);
  });
});

describe("get_exercise", () => {
  it("returns the full Exercise from the library", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "get_exercise", {
      exerciseSlug: BENCH.slug,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual(BENCH);
  });

  it("errors when no Exercise has the slug", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "get_exercise", {
      exerciseSlug: "nope-press",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      "Exercise nope-press not found. Use list_exercises to look up valid Exercise slugs."
    );
  });

  it("fails and reports when the library is unavailable", async () => {
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices({}, reportError, downLibrary());

    const result = await call(client, "get_exercise", {
      exerciseSlug: BENCH.slug,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(UNAVAILABLE);
    expect(reported).toHaveLength(1);
  });

  it("rejects an exerciseId instead of an exerciseSlug", async () => {
    const client = await connectWithServices({});

    const result = await call(client, "get_exercise", {
      exerciseId: "55555555-5555-4555-8555-555555555555",
    });

    expect(result.isError).toBe(true);
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
      .fn()
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
    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      entries: [entry],
      exerciseSlug: BENCH.slug,
      total: 1,
    });
  });

  it("returns a bodyweight set, with no weight and its set targets", async () => {
    const getExerciseHistory = vi
      .fn()
      .mockResolvedValue({ entries: [bodyweightEntry, entry], total: 2 });
    const client = await connectWithServices({ getExerciseHistory });

    const result = await call(client, "get_exercise_history", {
      exerciseSlug: BENCH.slug,
    });

    // the bodyweight set is there with no weight, and every set its targets
    expect(result.json).toEqual({
      entries: [bodyweightEntry, entry],
      exerciseSlug: BENCH.slug,
      total: 2,
    });
  });

  it("asks for 10 entries by default and rejects more than 50", async () => {
    const getExerciseHistory = vi
      .fn()
      .mockResolvedValue({ entries: [], total: 0 });
    const client = await connectWithServices({ getExerciseHistory });

    expect(
      (await call(client, "get_exercise_history", { exerciseSlug: BENCH.slug }))
        .json
    ).toEqual({ entries: [], exerciseSlug: BENCH.slug, total: 0 });
    expect(getExerciseHistory).toHaveBeenCalledWith({
      exerciseSlug: BENCH.slug,
      limit: 10,
      offset: 0,
    });

    const tooMany = await call(client, "get_exercise_history", {
      exerciseSlug: BENCH.slug,
      limit: 51,
    });
    expect(tooMany.isError).toBe(true);
    expect(getExerciseHistory).toHaveBeenCalledOnce();
  });

  it("reports database errors as tool errors without the SQL", async () => {
    const client = await connectWithServices({
      getExerciseHistory: () => Promise.reject(queryFailure("deadlock")),
    });

    const result = await call(client, "get_exercise_history", {
      exerciseSlug: BENCH.slug,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock");
  });
});
