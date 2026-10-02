import { afterEach, describe, expect, it } from "vitest";
import { failure, ok } from "./fake-supabase.js";
import {
  BENCH_ID,
  call,
  callsTo,
  connectWithFake,
  expectAllCallsRouted,
  SESSION_ID,
} from "./harness.js";

afterEach(expectAllCallsRouted);

const benchRow = {
  description: "Barbell press",
  id: BENCH_ID,
  muscle_groups: ["chest"],
  name: "Bench Press",
  slug: "bench-press",
};

describe("list_exercises", () => {
  it("escapes the search, filters by muscle group and paginates", async () => {
    const { client, fake } = await connectWithFake([
      {
        filters: [
          ["ilike", "name", "%bench\\_100\\%%"],
          ["contains", "muscle_groups", '["chest"]'],
          ["order", "name"],
          ["order", "id"],
          ["range", 2, 3],
        ],
        head: false,
        name: "exercises",
        operation: "select",
        response: ok([benchRow, { ...benchRow, id: "x", name: "Bench 2" }], 5),
      },
    ]);

    const result = await call(client, "list_exercises", {
      limit: 2,
      muscleGroup: "chest",
      offset: 2,
      search: "bench_100%",
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      hasMore: true,
      limit: 2,
      offset: 2,
      total: 5,
    });
    expect(result.json.exercises).toHaveLength(2);
    const [query] = callsTo(fake.calls, "exercises");
    expect(query?.selectOptions).toEqual({ count: "exact", head: false });
  });

  it("returns an empty last page with the total when the offset is past the end", async () => {
    const { client, fake } = await connectWithFake([
      {
        head: false,
        name: "exercises",
        operation: "select",
        response: failure("Requested range not satisfiable", "PGRST103"),
      },
      {
        filters: [["contains", "muscle_groups", '["back"]']],
        head: true,
        name: "exercises",
        operation: "select",
        response: ok(null, 7),
      },
    ]);

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
    expect(callsTo(fake.calls, "exercises")).toHaveLength(2);
  });

  it("reports other database errors as tool errors", async () => {
    const { client } = await connectWithFake([
      {
        name: "exercises",
        operation: "select",
        response: failure("canceling statement due to statement timeout"),
      },
    ]);
    const result = await call(client, "list_exercises");
    expect(result.isError).toBe(true);
    expect(result.text).toBe("canceling statement due to statement timeout");
  });
});

describe("get_exercise", () => {
  it("returns the full row", async () => {
    const { client } = await connectWithFake([
      {
        filters: [["eq", "id", BENCH_ID]],
        name: "exercises",
        operation: "select",
        response: ok({ ...benchRow, instructions: "Lower the bar…" }),
        select: "*",
      },
    ]);
    const result = await call(client, "get_exercise", { exerciseId: BENCH_ID });
    expect(result.json).toMatchObject({
      id: BENCH_ID,
      instructions: "Lower the bar…",
    });
  });

  it("errors when the exercise doesn't exist", async () => {
    const { client } = await connectWithFake([
      { name: "exercises", operation: "select", response: ok(null) },
    ]);
    const result = await call(client, "get_exercise", { exerciseId: BENCH_ID });
    expect(result.isError).toBe(true);
    expect(result.text).toBe(`Exercise ${BENCH_ID} not found.`);
  });
});

describe("get_exercise_history", () => {
  it("returns one entry per session exercise with logged sets in order", async () => {
    const { client } = await connectWithFake([
      {
        filters: [
          ["eq", "exercise_id", BENCH_ID],
          ["not", "sets.weight_completed", "is", null],
          ["order", "created_at", { ascending: false }],
          ["limit", 3],
        ],
        name: "workout_session_exercises",
        operation: "select",
        response: ok([
          {
            created_at: "2026-10-01T10:05:00Z",
            id: "wse-1",
            session: {
              finished_at: "2026-10-01T11:00:00Z",
              id: SESSION_ID,
              plan: { id: "plan", name: "Plan" },
              started_at: "2026-10-01T10:00:00Z",
              workout: { id: "workout", name: "Day A" },
            },
            sets: [
              { id: "s2", order: 2, reps_completed: 6, weight_completed: 80 },
              { id: "s1", order: 1, reps_completed: 8, weight_completed: 75 },
            ],
          },
        ]),
        select: "sets:workout_session_exercise_sets!inner",
      },
    ]);

    const result = await call(client, "get_exercise_history", {
      exerciseId: BENCH_ID,
      limit: 3,
    });

    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({
      entries: [
        {
          plan: { name: "Plan" },
          session_exercise_id: "wse-1",
          session_id: SESSION_ID,
          sets: [{ id: "s1" }, { id: "s2" }],
          workout: { name: "Day A" },
        },
      ],
      exerciseId: BENCH_ID,
    });
  });
});
