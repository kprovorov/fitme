import { describe, expect, it } from "vitest";
import {
  createExerciseLibrary,
  ExerciseLibraryRateLimitedError,
  ExerciseLibraryUnauthorizedError,
  ExerciseLibraryUnavailableError,
  type ListExercisesParams,
} from "..";
import { createFakeExerciseLibrary } from "../fake";
import { exercise, stubApi } from "./stub-api";

const exercises = [
  exercise("squat", { muscle_groups: ["quadriceps", "glutes"] }),
  exercise("bench-press"),
  exercise("incline-bench-press", { muscle_groups: ["chest", "shoulders"] }),
  exercise("bench-dip", { muscle_groups: ["triceps"] }),
  exercise("deadlift", { muscle_groups: ["back", "hamstrings"] }),
  exercise("front-squat", { muscle_groups: ["quadriceps"] }),
  exercise("100-percent_curl", {
    muscle_groups: ["biceps"],
    name: "100% Curl_",
  }),
  // two with the same name: ties go by slug
  exercise("row-b", { muscle_groups: ["back"], name: "Row" }),
  exercise("row-a", { muscle_groups: ["back"], name: "Row" }),
  ...Array.from({ length: 45 }, (_, i) =>
    exercise(`drill-${String(i).padStart(2, "0")}`, {
      muscle_groups: ["cardio"],
    })
  ),
];

const real = createExerciseLibrary({
  fetch: stubApi(exercises).fetch,
  token: () => Promise.resolve("secret"),
  url: "https://exercises.test",
});
const fake = createFakeExerciseLibrary(exercises);

describe("the fake answers like the real client", () => {
  it.each<[string, ListExercisesParams | undefined]>([
    ["no parameters", undefined],
    ["a search", { search: "bench" }],
    ["a case-insensitive, trimmed search", { search: "  SQUAT " }],
    ["a search with % and _ taken literally", { search: "% curl_" }],
    ["a search nothing matches", { search: "zzz" }],
    ["a muscle group", { muscleGroup: "back" }],
    ["search and muscle group", { muscleGroup: "chest", search: "press" }],
    ["a page", { limit: 5, offset: 3 }],
    ["the last page", { limit: 10, muscleGroup: "cardio", offset: 40 }],
    ["an offset past the end", { offset: 500 }],
  ])("list with %s", async (_, params) => {
    expect(await fake.list(params)).toEqual(await real.list(params));
  });

  it("lookup across chunks, with repeats and missing slugs", async () => {
    const slugs = [
      ...exercises.map((e) => e.slug).reverse(),
      "nope",
      "squat",
      "",
      "a,b",
      "nope",
    ];

    const answer = await fake.lookup(slugs);

    expect(answer).toEqual(await real.lookup(slugs));
    expect(answer.missing).toEqual(["nope", "", "a,b"]);
  });

  it("answers summaries only, without description or instructions", async () => {
    const { data } = await fake.lookup(["squat"]);

    expect(Object.keys(data[0] ?? {}).sort()).toEqual([
      "muscle_groups",
      "name",
      "slug",
      "thumbnail_url",
      "video_url",
    ]);
  });
});

describe("failing", () => {
  it.each([
    new ExerciseLibraryUnauthorizedError(),
    new ExerciseLibraryRateLimitedError(30),
    new ExerciseLibraryUnavailableError(),
  ])("fails every call with $name until told to stop", async (error) => {
    const library = createFakeExerciseLibrary(exercises);

    library.failWith(error);

    await expect(library.list()).rejects.toBe(error);
    await expect(library.lookup(["squat"])).rejects.toBe(error);

    library.failWith(null);

    expect((await library.lookup(["squat"])).data).toHaveLength(1);
  });

  it("validates list parameters like the API", async () => {
    await expect(fake.list({ limit: 51 })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(fake.list({ limit: 0 })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(fake.list({ offset: -1 })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(fake.list({ search: "x".repeat(101) })).rejects.toMatchObject({
      code: "invalid_request",
    });
  });
});
