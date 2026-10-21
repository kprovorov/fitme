import { describe, expect, it, vi } from "vitest";
import {
  BENCH_ID,
  call,
  connectWithServices,
  recordingReporter,
  SESSION_ID,
} from "./harness.js";

const benchRow = {
  description: "Barbell press",
  id: BENCH_ID,
  muscle_groups: ["chest"],
  name: "Bench Press",
  slug: "bench-press",
};

/** A failure as Drizzle throws it: the SQL in the message, Postgres as the cause. */
const queryFailure = (message: string) =>
  new Error('Failed query: select "id" from "exercises"\nparams: ', {
    cause: Object.assign(new Error(message), { code: "57014" }),
  });

describe("list_exercises", () => {
  it("passes the trimmed search, muscle group and page to the service", async () => {
    const listExercises = vi.fn().mockResolvedValue({
      exercises: [benchRow, { ...benchRow, id: "x", name: "Bench 2" }],
      hasMore: true,
      limit: 2,
      offset: 2,
      total: 5,
    });
    const client = await connectWithServices({ listExercises });

    const result = await call(client, "list_exercises", {
      limit: 2,
      muscleGroup: "chest",
      offset: 2,
      search: "  bench_100%  ",
    });

    expect(listExercises).toHaveBeenCalledWith({
      limit: 2,
      muscleGroup: "chest",
      offset: 2,
      search: "bench_100%",
    });
    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      exercises: [benchRow, { ...benchRow, id: "x", name: "Bench 2" }],
      hasMore: true,
      limit: 2,
      offset: 2,
      total: 5,
    });
  });

  it("asks for the first page of 20 by default", async () => {
    const listExercises = vi.fn().mockResolvedValue({
      exercises: [],
      hasMore: false,
      limit: 20,
      offset: 0,
      total: 0,
    });
    const client = await connectWithServices({ listExercises });

    await call(client, "list_exercises");

    expect(listExercises).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  });

  it("returns an empty last page with the total when the offset is past the end", async () => {
    const client = await connectWithServices({
      listExercises: () =>
        Promise.resolve({
          exercises: [],
          hasMore: false,
          limit: 20,
          offset: 40,
          total: 7,
        }),
    });

    const result = await call(client, "list_exercises", {
      muscleGroup: "back",
      offset: 40,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toEqual({
      exercises: [],
      hasMore: false,
      limit: 20,
      offset: 40,
      total: 7,
    });
  });

  it("rejects a page size over the maximum and an unknown muscle group, unreported", async () => {
    const listExercises = vi.fn();
    const { reportError, reported } = recordingReporter();
    const client = await connectWithServices({ listExercises }, reportError);

    expect((await call(client, "list_exercises", { limit: 101 })).isError).toBe(
      true
    );
    expect(
      (await call(client, "list_exercises", { muscleGroup: "wings" })).isError
    ).toBe(true);
    expect(listExercises).not.toHaveBeenCalled();
    expect(reported).toEqual([]);
  });

  it("reports database errors as tool errors without the SQL", async () => {
    const client = await connectWithServices({
      listExercises: () =>
        Promise.reject(
          queryFailure("canceling statement due to statement timeout")
        ),
    });

    const result = await call(client, "list_exercises");

    expect(result.isError).toBe(true);
    expect(result.text).toBe("canceling statement due to statement timeout");
  });
});

describe("get_exercise", () => {
  it("returns the full Exercise", async () => {
    const exercise = {
      ...benchRow,
      created_at: "2026-01-01T00:00:00+00:00",
      instructions: "Lower the bar…",
      thumbnail_url: null,
      updated_at: "2026-01-01T00:00:00+00:00",
      video_url: null,
    };
    const getExercise = vi.fn().mockResolvedValue(exercise);
    const client = await connectWithServices({ getExercise });

    const result = await call(client, "get_exercise", { exerciseId: BENCH_ID });

    expect(getExercise).toHaveBeenCalledWith(BENCH_ID);
    expect(result.json).toEqual(exercise);
  });

  it("errors when the Exercise doesn't exist", async () => {
    const client = await connectWithServices({
      getExercise: () => Promise.resolve(null),
    });

    const result = await call(client, "get_exercise", { exerciseId: BENCH_ID });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(`Exercise ${BENCH_ID} not found.`);
  });

  it("rejects an id that isn't a uuid", async () => {
    const getExercise = vi.fn();
    const client = await connectWithServices({ getExercise });

    const result = await call(client, "get_exercise", { exerciseId: "bench" });

    expect(result.isError).toBe(true);
    expect(getExercise).not.toHaveBeenCalled();
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
        weight_completed: 75,
      },
      {
        id: "s2",
        logged_at: null,
        order: 2,
        reps_completed: 6,
        weight_completed: 80,
      },
    ],
    started_at: "2026-10-01T10:00:00+00:00",
    workout: { id: "workout", name: "Day A" },
  };

  it("returns the service's entries for the Exercise", async () => {
    const getExerciseHistory = vi.fn().mockResolvedValue([entry]);
    const client = await connectWithServices({ getExerciseHistory });

    const result = await call(client, "get_exercise_history", {
      exerciseId: BENCH_ID,
      limit: 3,
    });

    expect(getExerciseHistory).toHaveBeenCalledWith({
      exerciseId: BENCH_ID,
      limit: 3,
    });
    expect(result.isError).toBe(false);
    expect(result.json).toEqual({ entries: [entry], exerciseId: BENCH_ID });
  });

  it("asks for 10 entries by default and rejects more than 50", async () => {
    const getExerciseHistory = vi.fn().mockResolvedValue([]);
    const client = await connectWithServices({ getExerciseHistory });

    expect(
      (await call(client, "get_exercise_history", { exerciseId: BENCH_ID }))
        .json
    ).toEqual({ entries: [], exerciseId: BENCH_ID });
    expect(getExerciseHistory).toHaveBeenCalledWith({
      exerciseId: BENCH_ID,
      limit: 10,
    });

    const tooMany = await call(client, "get_exercise_history", {
      exerciseId: BENCH_ID,
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
      exerciseId: BENCH_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe("deadlock");
  });
});
