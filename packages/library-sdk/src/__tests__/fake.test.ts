import type { AppLanguage } from "@fitme/core/models";
import { describe, expect, it } from "vitest";
import {
  createLibrary,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
  type ListExercisesParams,
} from "..";
import { createFakeLibrary } from "../fake";
import { exercise, stubApi } from "./stub-api";

/** A made-up Ukrainian translation of `name`. */
const uk = (name: string) => ({
  translations: {
    uk: { description: `Про ${name}.`, instructions: `Виконуй ${name}.`, name },
  },
});

// Some translated, some not (answered wholly in English): Ukrainian order
// puts Ґ after Г, Є after Е and І, Ї after И, which English collation doesn't.
const exercises = [
  exercise("squat", {
    muscle_groups: ["quadriceps", "glutes"],
    ...uk("Присід"),
  }),
  exercise("bench-press", uk("Жим лежачи")),
  exercise("incline-bench-press", {
    muscle_groups: ["chest", "shoulders"],
    ...uk("Жим на похилій лаві"),
  }),
  exercise("bench-dip", {
    muscle_groups: ["triceps"],
    ...uk("Ґак-віджимання"),
  }),
  exercise("deadlift", { muscle_groups: ["back", "hamstrings"], ...uk("Гак") }),
  exercise("front-squat", {
    muscle_groups: ["quadriceps"],
    ...uk("Їжак присід"),
  }),
  exercise("hip-thrust", { muscle_groups: ["glutes"], ...uk("Ехо міст") }),
  exercise("lunge", { muscle_groups: ["glutes"], ...uk("Єдиний випад") }),
  exercise("plank", { muscle_groups: ["abs"], ...uk("Іспит планка") }),
  exercise("crunch", { muscle_groups: ["abs"], ...uk("Ирій скручування") }),
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

const real = createLibrary({
  fetch: stubApi(exercises).fetch,
  token: () => Promise.resolve("secret"),
  url: "https://exercises.test",
});
const fake = createFakeLibrary(exercises);

describe.each<[string, AppLanguage | undefined]>([
  ["no language", undefined],
  ["English", "en"],
  ["Ukrainian", "uk"],
])("the fake answers like the real client, in %s", (_label, language) => {
  it.each<[string, ListExercisesParams]>([
    ["no parameters", {}],
    ["a search", { search: "bench" }],
    ["a case-insensitive, trimmed search", { search: "  SQUAT " }],
    ["a search with % and _ taken literally", { search: "% curl_" }],
    ["a search nothing matches", { search: "zzz" }],
    ["a muscle group", { muscleGroup: "back" }],
    ["search and muscle group", { muscleGroup: "chest", search: "press" }],
    ["a page", { limit: 5, offset: 3 }],
    ["the last page", { limit: 10, muscleGroup: "cardio", offset: 40 }],
    ["an offset past the end", { offset: 500 }],
    ["a search for a Ukrainian name", { search: "жим" }],
    ["a search for an English name", { search: "bench" }],
    ["a search with Ukrainian letters", { search: "Ґ" }],
  ])("list with %s", async (_, params) => {
    const asked = language ? { ...params, language } : params;

    expect(await fake.list(asked)).toEqual(await real.list(asked));
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

    const answer = await fake.lookup(slugs, { language });

    expect(answer).toEqual(await real.lookup(slugs, { language }));
    expect(answer.missing).toEqual(["nope", "", "a,b"]);
  });

  it.each(["squat", "100-percent_curl", "nope", ""])("get %j", async (slug) => {
    expect(await fake.get(slug, { language })).toEqual(
      await real.get(slug, { language })
    );
  });

  it("answers summaries only, without description or instructions", async () => {
    const { data } = await fake.lookup(["squat"], { language });

    expect(Object.keys(data[0] ?? {}).sort()).toEqual([
      "muscle_groups",
      "name",
      "slug",
      "thumbnail_url",
      "video_url",
    ]);
  });
});

describe("language", () => {
  it("answers a translated Exercise in the language, an untranslated one wholly in English", async () => {
    expect(await fake.get("squat", { language: "uk" })).toMatchObject({
      description: "Про Присід.",
      instructions: "Виконуй Присід.",
      name: "Присід",
    });
    expect(await fake.get("row-a", { language: "uk" })).toEqual(
      await fake.get("row-a")
    );
  });

  it("sorts by the Ukrainian name with Ukrainian collation", async () => {
    const { data } = await fake.list({ language: "uk", muscleGroup: "abs" });

    expect(data.map((e) => e.name)).toEqual([
      "Ирій скручування",
      "Іспит планка",
    ]);
  });

  it("answers English without a language", async () => {
    expect((await fake.get("squat"))?.name).toBe("Squat");
    expect((await fake.list({ search: "присід" })).total).toBe(0);
  });
});

describe("failing", () => {
  it.each([
    new LibraryUnauthorizedError(),
    new LibraryRateLimitedError(30),
    new LibraryUnavailableError(),
  ])("fails every call with $name until told to stop", async (error) => {
    const library = createFakeLibrary(exercises);

    library.failWith(error);

    await expect(library.list()).rejects.toBe(error);
    await expect(library.lookup(["squat"])).rejects.toBe(error);
    await expect(library.get("squat")).rejects.toBe(error);

    library.failWith(null);

    expect((await library.lookup(["squat"])).data).toHaveLength(1);
  });

  it("answers get with empty texts for an Exercise given as a summary", async () => {
    const { description: _, instructions: __, ...squat } = exercise("squat");

    expect(await createFakeLibrary([squat]).get("squat")).toEqual({
      ...squat,
      description: "",
      instructions: "",
    });
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
