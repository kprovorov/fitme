/// <reference lib="es2023.array" />

import type { AppLanguage, Equipment } from "@fitme/core/models";
import { describe, expect, it } from "vitest";

import {
  createLibrary,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
} from "..";
import type { ListExercisesParams } from "..";
import { createFakeLibrary } from "../fake";
import { cover, exercise, stubApi } from "./stub-api";

/** The Equipment the drills rotate through; the third needs none. */
const DRILL_EQUIPMENT: Equipment[][] = [["dumbbell"], ["machine"], []];

/** A made-up Ukrainian translation of `name`. */
const uk = (name: string) => ({
  translations: {
    uk: { description: `Про ${name}.`, instructions: `Виконуй ${name}.`, name },
  },
});

// Some translated, some not (answered wholly in English): Ukrainian order
// puts Ґ after Г, Є after Е and І, Ї after И, which English collation doesn't.
// Equipment is given in `@fitme/core`'s order, which is how the API answers
// it, so the stubbed API (which answers what it's given) and the fake agree.
// Some Exercises carry none, as an untagged one does while the field is
// optional in the bundle.
const exercises = [
  exercise("squat", {
    muscle_groups: ["quadriceps", "glutes"],
    ...uk("Присід"),
  }),
  exercise("bench-press", {
    equipment: ["barbell", "bench"],
    ...uk("Жим лежачи"),
  }),
  exercise("incline-bench-press", {
    equipment: ["barbell", "bench"],
    muscle_groups: ["chest", "shoulders"],
    ...uk("Жим на похилій лаві"),
  }),
  exercise("bench-dip", {
    equipment: ["bench", "bodyweight"],
    muscle_groups: ["triceps"],
    ...uk("Ґак-віджимання"),
  }),
  exercise("deadlift", { muscle_groups: ["back", "hamstrings"], ...uk("Гак") }),
  exercise("front-squat", {
    muscle_groups: ["quadriceps"],
    ...uk("Їжак присід"),
  }),
  exercise("hip-thrust", {
    equipment: ["barbell", "bench"],
    muscle_groups: ["glutes"],
    ...uk("Ехо міст"),
  }),
  exercise("lunge", {
    equipment: ["dumbbell"],
    muscle_groups: ["glutes"],
    ...uk("Єдиний випад"),
  }),
  exercise("plank", {
    equipment: ["bodyweight"],
    muscle_groups: ["abs"],
    ...uk("Іспит планка"),
  }),
  exercise("crunch", {
    equipment: ["bodyweight"],
    muscle_groups: ["abs"],
    ...uk("Ирій скручування"),
  }),
  exercise("100-percent_curl", {
    equipment: ["dumbbell", "cable"],
    muscle_groups: ["biceps"],
    name: "100% Curl_",
  }),
  // two with the same name: ties go by slug
  exercise("row-b", {
    equipment: ["cable"],
    muscle_groups: ["back"],
    name: "Row",
  }),
  exercise("row-a", {
    equipment: ["dumbbell"],
    muscle_groups: ["back"],
    name: "Row",
  }),
  ...Array.from({ length: 45 }, (_, i) =>
    exercise(`drill-${String(i).padStart(2, "0")}`, {
      equipment: DRILL_EQUIPMENT[i % 3] ?? [],
      muscle_groups: ["cardio"],
    })
  ),
];

const covers = [
  cover("3f2b8a4e-6c1d-4e5f-9a7b-1c2d3e4f5a6b", {
    muscle_groups: ["quadriceps", "glutes"],
  }),
  cover("0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d", { muscle_groups: ["back"] }),
  cover("ffffffff-0000-4000-8000-000000000000"),
];

const real = createLibrary({
  fetch: stubApi(exercises, undefined, covers).fetch,
  token: async () => await Promise.resolve("secret"),
  url: "https://exercises.test",
});

const fake = createFakeLibrary(exercises, { covers });

describe.each<[string, AppLanguage | undefined]>([
  ["no language", undefined],
  ["English", "en"],
  ["Ukrainian", "uk"],
  ["Spanish", "es"],
  ["Catalan", "ca"],
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
    ["several muscle groups", { muscleGroups: ["glutes", "abs", "triceps"] }],
    ["a repeated muscle group", { muscleGroups: ["glutes", "glutes"] }],
    ["no muscle groups", { muscleGroups: [] }],
    ["muscle groups nothing has", { muscleGroups: ["calves", "forearms"] }],
    [
      "muscle groups, a search and a page",
      { limit: 2, muscleGroups: ["glutes", "back"], offset: 1, search: "r" },
    ],
    [
      "muscle groups and the last page",
      { limit: 10, muscleGroups: ["cardio", "abs"], offset: 40 },
    ],
    ["one piece of Equipment", { equipment: ["dumbbell"] }],
    ["several pieces of Equipment", { equipment: ["cable", "bench"] }],
    ["a repeated piece of Equipment", { equipment: ["bench", "bench"] }],
    ["no Equipment", { equipment: [] }],
    ["Equipment nothing needs", { equipment: ["landmine", "pull_up_bar"] }],
    ["bodyweight", { equipment: ["bodyweight"] }],
    [
      "Equipment and a muscle group",
      { equipment: ["bench"], muscleGroup: "chest" },
    ],
    [
      "Equipment and muscle groups",
      { equipment: ["dumbbell", "cable"], muscleGroups: ["back", "biceps"] },
    ],
    [
      "Equipment and a search",
      { equipment: ["barbell", "bench"], search: "bench" },
    ],
    [
      "Equipment, muscle groups and a search nothing matches together",
      { equipment: ["bodyweight"], muscleGroups: ["chest"], search: "press" },
    ],
    ["Equipment and a page", { equipment: ["machine"], limit: 5, offset: 3 }],
    [
      "Equipment and the last page",
      { equipment: ["machine"], limit: 10, offset: 10 },
    ],
    [
      "Equipment, muscle groups, a search and a page",
      {
        equipment: ["dumbbell", "bodyweight"],
        limit: 4,
        muscleGroups: ["cardio", "abs"],
        offset: 3,
        search: "drill",
      },
    ],
  ])("list with %s", async (_, params) => {
    const asked = language ? { ...params, language } : params;

    await expect(fake.list(asked)).resolves.toStrictEqual(
      await real.list(asked)
    );
  });

  it.each<
    [
      string,
      { equipment?: string[]; muscleGroup?: string; muscleGroups?: string[] },
    ]
  >([
    ["an unknown muscle group", { muscleGroups: ["chest", "neck"] }],
    ["an empty muscle group", { muscleGroups: ["chest", ""] }],
    [
      "muscleGroup and muscleGroups together",
      { muscleGroup: "chest", muscleGroups: ["triceps"] },
    ],
    [
      "an unknown piece of Equipment",
      { equipment: ["dumbbell", "kettlebell"] },
    ],
    ["an empty piece of Equipment", { equipment: ["dumbbell", ""] }],
  ])("list refusing %s", async (_, params) => {
    const asked: ListExercisesParams = language ? { language } : {};
    // Inject invalid runtime filters to exercise validation beyond the typed API.
    Object.assign(asked, params);

    const [fakeResult, realResult] = await Promise.allSettled([
      fake.list(asked),
      real.list(asked),
    ]);

    expect(fakeResult).toHaveProperty(
      "reason",
      expect.any(LibraryInvalidRequestError)
    );
    expect(fakeResult).toStrictEqual(realResult);
  });

  it("lookup across chunks, with repeats and missing slugs", async () => {
    const slugs = [
      ...exercises.map((e) => e.slug).toReversed(),
      "nope",
      "squat",
      "",
      "a,b",
      "nope",
    ];

    const answer = await fake.lookup(slugs, { language });

    expect(answer).toStrictEqual(await real.lookup(slugs, { language }));
    expect(answer.missing).toStrictEqual(["nope", "", "a,b"]);
  });

  it.each(["squat", "100-percent_curl", "nope", ""])("get %j", async (slug) => {
    await expect(fake.get(slug, { language })).resolves.toStrictEqual(
      await real.get(slug, { language })
    );
  });

  it("answers summaries only, without description or instructions", async () => {
    const { data } = await fake.lookup(["squat"], { language });

    expect(Object.keys(data[0] ?? {}).toSorted()).toStrictEqual([
      "equipment",
      "muscle_groups",
      "name",
      "slug",
      "thumbnail_url",
      "video_url",
    ]);
  });
});

describe("covers", () => {
  it("answers every Cover like the real client, in the order given", async () => {
    const answer = await fake.covers();

    expect(answer).toStrictEqual(await real.covers());
    expect(answer.map((c) => c.id)).toStrictEqual(covers.map((c) => c.id));
  });

  it("answers an empty list like the real client without Covers", async () => {
    const empty = createLibrary({
      fetch: stubApi(exercises).fetch,
      token: async () => await Promise.resolve("secret"),
      url: "https://exercises.test",
    });

    await expect(createFakeLibrary(exercises).covers()).resolves.toStrictEqual(
      await empty.covers()
    );
    await expect(createFakeLibrary(exercises).covers()).resolves.toStrictEqual(
      []
    );
  });

  it("answers copies, so a caller changing one leaves the fake alone", async () => {
    const library = createFakeLibrary([], { covers });
    const [first] = await library.covers();
    first?.muscle_groups.push("abs");

    await expect(library.covers()).resolves.toStrictEqual(covers);
  });
});

describe("equipment", () => {
  // the API answers Equipment in core's order whatever order the bundle wrote
  // it in, so the fake does too
  const outOfOrder = createFakeLibrary([
    exercise("pull-up", {
      equipment: ["bodyweight", "bench", "pull_up_bar", "bench"],
      ...uk("Підтягування"),
    }),
  ]);

  it("answers none for an Exercise given without any", async () => {
    const { equipment: _, ...untagged } = exercise("sit-up");
    const library = createFakeLibrary([untagged]);

    await expect(library.get("sit-up")).resolves.toMatchObject({
      equipment: [],
    });
    const lookup = await library.lookup(["sit-up"]);
    const list = await library.list();

    expect(lookup.data[0]?.equipment).toStrictEqual([]);
    expect(list.data[0]?.equipment).toStrictEqual([]);
    await expect(
      library.list({ equipment: ["bodyweight"] })
    ).resolves.toMatchObject({
      total: 0,
    });
  });

  it.each<AppLanguage | undefined>([undefined, "en", "uk"])(
    "answers it in core's order on get, lookup and list, in %s",
    async (language) => {
      const inCoreOrder = ["bench", "pull_up_bar", "bodyweight"];

      const found = await outOfOrder.get("pull-up", { language });
      const lookup = await outOfOrder.lookup(["pull-up"], { language });
      const list = await outOfOrder.list({ language });

      expect(found?.equipment).toStrictEqual(inCoreOrder);
      expect(lookup.data[0]?.equipment).toStrictEqual(inCoreOrder);
      expect(list.data[0]?.equipment).toStrictEqual(inCoreOrder);
    }
  );
});

describe("language", () => {
  it("answers a translated Exercise in the language, an untranslated one wholly in English", async () => {
    await expect(fake.get("squat", { language: "uk" })).resolves.toMatchObject({
      description: "Про Присід.",
      instructions: "Виконуй Присід.",
      name: "Присід",
    });
    await expect(fake.get("row-a", { language: "uk" })).resolves.toStrictEqual(
      await fake.get("row-a")
    );
  });

  it("sorts by the Ukrainian name with Ukrainian collation", async () => {
    const { data } = await fake.list({ language: "uk", muscleGroup: "abs" });

    expect(data.map((e) => e.name)).toStrictEqual([
      "Ирій скручування",
      "Іспит планка",
    ]);
  });

  it("answers English without a language", async () => {
    const found = await fake.get("squat");
    const list = await fake.list({ search: "присід" });

    expect(found?.name).toBe("Squat");
    expect(list.total).toBe(0);
  });
});

describe("failing", () => {
  describe.each([
    { failure: new LibraryUnauthorizedError() },
    { failure: new LibraryRateLimitedError(30) },
    { failure: new LibraryUnavailableError() },
  ])("with $failure.name", ({ failure }) => {
    it("fails every call", async () => {
      const library = createFakeLibrary(exercises, { covers });

      library.failWith(failure);

      await expect(library.list()).rejects.toBe(failure);
      await expect(library.lookup(["squat"])).rejects.toBe(failure);
      await expect(library.get("squat")).rejects.toBe(failure);
      await expect(library.covers()).rejects.toBe(failure);
    });

    it("answers again when told to stop failing", async () => {
      const library = createFakeLibrary(exercises, { covers });

      library.failWith(failure);
      await expect(library.lookup(["squat"])).rejects.toBe(failure);
      library.failWith(null);

      const lookup = await library.lookup(["squat"]);

      expect(lookup.data).toHaveLength(1);
      await expect(library.covers()).resolves.toStrictEqual(covers);
    });
  });

  it("answers get with empty texts for an Exercise given as a summary", async () => {
    const { description: _, instructions: __, ...squat } = exercise("squat");

    await expect(
      createFakeLibrary([squat]).get("squat")
    ).resolves.toStrictEqual({
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
