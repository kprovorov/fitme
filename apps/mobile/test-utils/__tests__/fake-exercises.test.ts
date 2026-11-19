/**
 * The fake Public API's Exercise routes through the real client, as the app
 * will read them: `GET /v1/exercises` (list, search, filters, paging,
 * `language`), its `slugs` lookup and `GET /v1/exercises/{slug}`.
 */
import { ApiError } from "@fitme/api-client";
import { beforeEach, describe, expect, it } from "@jest/globals";

import { publicApi } from "~/lib/public-api";
import {
  EXERCISES_CACHE_CONTROL,
  fakeExercise,
  serveExercises,
} from "~/test-utils/fake-exercises";
import { fakePublicApi } from "~/test-utils/fake-public-api";

beforeEach(() => {
  serveExercises(
    [
      fakeExercise("bench-press", {
        aliases: ["Flat press"],
        equipment: ["bench", "barbell"],
        name: "Bench Press",
        translations: { uk: { name: "Жим лежачи" } },
      }),
      fakeExercise("back-squat", {
        equipment: ["barbell"],
        movement_patterns: ["squat"],
        muscle_groups: ["quadriceps", "glutes"],
        name: "Back Squat",
        translations: { uk: { name: "Присідання" } },
      }),
      fakeExercise("push-up", {
        name: "Push-up",
        secondary_muscle_groups: ["triceps"],
      }),
      fakeExercise("deadlift", {
        equipment: ["barbell"],
        movement_patterns: ["hinge"],
        muscle_groups: ["hamstrings"],
        name: "Deadlift",
        translations: { uk: { name: "Станова тяга" } },
      }),
    ],
    { replacedSlugs: { "barbell-bench-press": "bench-press" } }
  );
});

type ListQuery = NonNullable<
  Parameters<ReturnType<typeof publicApi>["GET"]>[1]
>;

const list = async (query: Record<string, number | string> = {}) => {
  const { data, response } = await publicApi().GET("/v1/exercises", {
    params: { query },
  } as ListQuery);

  return { data, response };
};

const names = (data: unknown) =>
  (data as { data: { name: string }[] }).data.map(({ name }) => name);

/** The names a list answers. */
const listNames = async (query: Record<string, number | string> = {}) => {
  const { data } = await list(query);

  return names(data);
};

describe("GET /v1/exercises", () => {
  it("lists alphabetically in English by default, with the cache headers", async () => {
    const { data, response } = await list();

    expect(names(data)).toEqual([
      "Back Squat",
      "Bench Press",
      "Deadlift",
      "Push-up",
    ]);
    expect(data).toMatchObject({ hasMore: false, total: 4 });
    expect(response.headers.get("Cache-Control")).toBe(EXERCISES_CACHE_CONTROL);
    expect(response.headers.get("ETag")).toMatch(/^"[0-9a-f]{64}"$/u);
  });

  it("answers in the asked language with its collation, untranslated ones wholly in English", async () => {
    const { data } = await list({ language: "uk" });

    // Ukrainian's collation puts Cyrillic before Latin
    expect(names(data)).toEqual([
      "Жим лежачи",
      "Присідання",
      "Станова тяга",
      "Push-up",
    ]);
  });

  it("searches the name in the language, the English name and the aliases", async () => {
    await expect(listNames({ search: " flat " })).resolves.toEqual([
      "Bench Press",
    ]);
    await expect(
      listNames({ language: "uk", search: "bench" })
    ).resolves.toEqual(["Жим лежачи"]);
    await expect(
      listNames({ language: "uk", search: "тяга" })
    ).resolves.toEqual(["Станова тяга"]);
  });

  it("filters by primary muscle groups and Equipment together", async () => {
    await expect(
      listNames({ muscle_groups: "chest,hamstrings" })
    ).resolves.toEqual(["Bench Press", "Deadlift", "Push-up"]);
    // triceps is only Push-up's secondary group
    await expect(listNames({ muscle_groups: "triceps" })).resolves.toEqual([]);
    await expect(
      listNames({ equipment: "barbell", muscle_groups: "chest" })
    ).resolves.toEqual(["Bench Press"]);
  });

  it("answers Equipment in the core order", async () => {
    const { data } = await list({ search: "bench" });

    expect(data).toMatchObject({ data: [{ equipment: ["barbell", "bench"] }] });
  });

  it("pages with limit and offset", async () => {
    const first = await list({ limit: 3 });
    const second = await list({ limit: 3, offset: 3 });
    const past = await list({ offset: 10 });

    expect(first.data).toMatchObject({ hasMore: true, total: 4 });
    expect(names(second.data)).toEqual(["Push-up"]);
    expect(second.data).toMatchObject({ hasMore: false, total: 4 });
    expect(past.data).toEqual({ data: [], hasMore: false, total: 4 });
  });

  it.each<Record<string, number | string>>([
    { limit: 51 },
    { muscle_groups: "abs" },
    { language: "ru" },
    { limit: 5, slugs: "push-up" },
  ])("refuses the invalid query %o", async (query) => {
    await expect(list(query)).rejects.toMatchObject({
      code: "invalid_request",
      status: 400,
    });
  });

  it("looks a batch up in asked order, an old slug resolving to its replacement", async () => {
    const { data } = await list({
      language: "uk",
      slugs: "deadlift,nope,barbell-bench-press,deadlift",
    });

    expect(data).toMatchObject({
      data: [
        { name: "Станова тяга", requested_slug: "deadlift", slug: "deadlift" },
        {
          name: "Жим лежачи",
          requested_slug: "barbell-bench-press",
          slug: "bench-press",
        },
      ],
      missing: ["nope"],
    });
  });

  it("answers 304 to its own ETag", async () => {
    const { response } = await list();
    const etag = response.headers.get("ETag") ?? "";

    const answer = await fakePublicApi.fetch("https://api.test/v1/exercises", {
      headers: {
        Authorization: "Bearer test-session-token",
        "If-None-Match": `W/${etag}`,
      },
      method: "GET",
    });

    expect(answer.status).toBe(304);
  });
});

describe("GET /v1/exercises/{slug}", () => {
  const get = (slug: string, language?: "en" | "uk") =>
    publicApi().GET("/v1/exercises/{slug}", {
      params: { path: { slug }, query: language ? { language } : {} },
    });

  it("answers one Exercise in full in the asked language", async () => {
    const { data } = await get("back-squat", "uk");

    expect(data?.data).toMatchObject({
      equipment: ["barbell"],
      muscle_groups: ["quadriceps", "glutes"],
      name: "Присідання",
      short_description: "About Присідання",
      slug: "back-squat",
      steps: ["Do Присідання"],
    });
    expect(data?.data.thumbnail_url).toContain("/render/image/public/library/");
  });

  it("answers an old slug with its replacement", async () => {
    const { data } = await get("barbell-bench-press");

    expect(data?.data).toMatchObject({
      name: "Bench Press",
      slug: "bench-press",
    });
  });

  it("answers 404 for an unknown slug", async () => {
    const failure = await get("nope").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: "not_found", status: 404 });
  });
});

describe("failures", () => {
  it("fails a 429 with Retry-After, then answers", async () => {
    fakePublicApi.failNext("GET /v1/exercises", {
      retryAfterSeconds: 12,
      status: 429,
    });

    await expect(list()).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 12,
      status: 429,
    });
    await expect(listNames()).resolves.toHaveLength(4);
  });

  it("holds a paused read until resumed", async () => {
    const resume = fakePublicApi.pause("GET /v1/exercises/{slug}");

    const pending = publicApi().GET("/v1/exercises/{slug}", {
      params: { path: { slug: "push-up" } },
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(fakePublicApi.inFlight).toBe(1);
    resume();
    const { data } = await pending;
    expect(data?.data.slug).toBe("push-up");
    expect(fakePublicApi.inFlight).toBe(0);
  });

  it("fails library_unavailable on demand", async () => {
    fakePublicApi.failNext("GET /v1/exercises/{slug}", {
      code: "library_unavailable",
      status: 503,
    });

    await expect(
      publicApi().GET("/v1/exercises/{slug}", {
        params: { path: { slug: "push-up" } },
      })
    ).rejects.toMatchObject({ code: "library_unavailable", status: 503 });
  });
});
