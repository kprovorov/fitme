import { describe, expect, it } from "vitest";
import {
  createLibrary,
  LibraryError,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
} from "..";
import { cover, exercise, stubApi } from "./stub-api";

const URL = "https://exercises.test";
const token = () => Promise.resolve("secret-token");

describe("lookup", () => {
  it("asks for 85 slugs in 3 requests of at most 40, in asked order, missing merged", async () => {
    const known = Array.from({ length: 80 }, (_, i) => exercise(`ex-${i}`));
    const api = stubApi(known);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });
    // 80 known in reverse, 5 unknown spread across the chunks
    const slugs = known.map((e) => e.slug).reverse();
    slugs.splice(10, 0, "nope-a");
    slugs.splice(45, 0, "nope-b");
    slugs.splice(70, 0, "nope-c");
    slugs.push("nope-d", "nope-e");

    const result = await library.lookup(slugs);

    expect(api.requests).toHaveLength(3);
    for (const request of api.requests) {
      expect(request.slugs?.length).toBeLessThanOrEqual(40);
    }
    expect(result.data.map((e) => e.slug)).toEqual(
      slugs.filter((slug) => !slug.startsWith("nope"))
    );
    expect(result.missing).toEqual([
      "nope-a",
      "nope-b",
      "nope-c",
      "nope-d",
      "nope-e",
    ]);
  });

  it("fetches a repeated slug once and answers it once", async () => {
    const api = stubApi([exercise("squat"), exercise("bench-press")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    const result = await library.lookup([
      "squat",
      "bench-press",
      "squat",
      "nope",
      "nope",
    ]);

    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]?.slugs).toEqual(["squat", "bench-press", "nope"]);
    expect(result.data.map((e) => e.slug)).toEqual(["squat", "bench-press"]);
    expect(result.missing).toEqual(["nope"]);
  });

  it("answers no slugs without a request", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    expect(await library.lookup([])).toEqual({ data: [], missing: [] });
    expect(api.requests).toHaveLength(0);
  });

  it("answers a slug that can't be sent (empty, or with a comma) as missing", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    const result = await library.lookup(["", "squat,lunge", "squat"]);

    expect(api.requests[0]?.slugs).toEqual(["squat"]);
    expect(result.data.map((e) => e.slug)).toEqual(["squat"]);
    expect(result.missing).toEqual(["", "squat,lunge"]);
  });
});

describe("list", () => {
  it("passes search, muscle group, limit and offset, and returns total and hasMore", async () => {
    const api = stubApi([
      exercise("bench-press"),
      exercise("incline-bench-press"),
      exercise("decline-bench-press"),
      exercise("bench-dip", { muscle_groups: ["triceps"] }),
      exercise("squat", { muscle_groups: ["quadriceps"] }),
    ]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    const page = await library.list({
      limit: 2,
      muscleGroup: "chest",
      offset: 1,
      search: "bench",
    });

    expect(api.requests[0]).toMatchObject({
      limit: "2",
      muscleGroup: "chest",
      offset: "1",
      search: "bench",
      slugs: null,
    });
    expect(page.data.map((e) => e.slug)).toEqual([
      "decline-bench-press",
      "incline-bench-press",
    ]);
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(false);
  });

  it("sends no parameter it wasn't given, so the API's defaults apply", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    const page = await library.list();

    expect([...(api.requests[0]?.url.searchParams.keys() ?? [])]).toEqual([]);
    expect(page).toMatchObject({ hasMore: false, total: 1 });
  });
});

describe("list by several muscle groups", () => {
  const exercises = [
    exercise("bench-press"),
    exercise("bench-dip", { muscle_groups: ["triceps"] }),
    exercise("deadlift", {
      muscle_groups: ["back"],
      translations: { uk: { description: "", instructions: "", name: "Тяга" } },
    }),
    exercise("pushdown", { muscle_groups: ["triceps"] }),
    exercise("squat", {
      muscle_groups: ["quadriceps", "glutes"],
      translations: {
        uk: { description: "", instructions: "", name: "Присід" },
      },
    }),
  ];
  const libraryOver = () => {
    const api = stubApi(exercises);
    return {
      api,
      library: createLibrary({ fetch: api.fetch, token, url: URL }),
    };
  };

  it("sends them comma-separated as muscle_groups and answers Exercises with any of them", async () => {
    const { api, library } = libraryOver();

    const page = await library.list({
      muscleGroups: ["triceps", "quadriceps"],
    });

    expect(api.requests[0]?.url.searchParams.get("muscle_groups")).toBe(
      "triceps,quadriceps"
    );
    expect(api.requests[0]?.url.searchParams.has("muscle_group")).toBe(false);
    expect(page.data.map((e) => e.slug)).toEqual([
      "bench-dip",
      "pushdown",
      "squat",
    ]);
  });

  it("sends them with language, search and paging", async () => {
    const { api, library } = libraryOver();

    const page = await library.list({
      language: "uk",
      limit: 1,
      muscleGroups: ["back", "glutes"],
      offset: 1,
      search: "a",
    });

    expect(api.requests[0]).toMatchObject({
      language: "uk",
      limit: "1",
      muscleGroups: ["back", "glutes"],
      offset: "1",
      search: "a",
    });
    expect(page).toEqual({
      data: [expect.objectContaining({ name: "Тяга" })],
      hasMore: false,
      total: 2,
    });
  });

  it.each<[string, { muscleGroups?: [] }]>([
    ["not given", {}],
    ["empty", { muscleGroups: [] }],
  ])("is never sent when %s", async (_, params) => {
    const { api, library } = libraryOver();

    const page = await library.list(params);

    expect(api.requests[0]?.url.searchParams.has("muscle_groups")).toBe(false);
    expect(page.total).toBe(exercises.length);
  });

  it("keeps muscleGroup as muscle_group", async () => {
    const { api, library } = libraryOver();

    await library.list({ muscleGroup: "back" });

    expect(api.requests[0]?.muscleGroup).toBe("back");
    expect(api.requests[0]?.muscleGroups).toBeNull();
  });

  it("surfaces the API's 400 for a value it refuses as invalid request", async () => {
    const { library } = libraryOver();

    const error = await library
      .list({ muscleGroup: "back", muscleGroups: ["chest"] })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LibraryInvalidRequestError);
    expect(error).toMatchObject({
      message: "muscle_groups: can't be combined with muscle_group",
    });
  });
});

describe("get", () => {
  it("answers one Exercise in full, description and instructions included", async () => {
    const squat = exercise("barbell-back-squat");
    const api = stubApi([squat, exercise("bench-press")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    expect(await library.get("barbell-back-squat")).toEqual(squat);
    expect(api.requests[0]?.url.pathname).toBe("/exercises/barbell-back-squat");
    expect(api.requests[0]?.authorization).toBe("Bearer secret-token");
  });

  it("answers null for a slug no Exercise has (404)", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    expect(await library.get("nope")).toBeNull();
  });

  it("escapes the slug into one path segment", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    expect(await library.get("../health?x=1")).toBeNull();
    expect(api.requests[0]?.exerciseSlug).toBe("../health?x=1");
  });

  it("answers null for an empty slug without a request", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    expect(await library.get("")).toBeNull();
    expect(api.requests).toHaveLength(0);
  });

  it("maps an answer without description or instructions to unavailable", async () => {
    const { description: _, ...withoutDescription } = exercise("squat");
    const library = createLibrary({
      fetch: stubApi([], () => Response.json(withoutDescription)).fetch,
      token,
      url: URL,
    });

    await expect(library.get("squat")).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });

  it("maps a 5xx to unavailable", async () => {
    const library = createLibrary({
      fetch: stubApi([], () => new Response(null, { status: 503 })).fetch,
      token,
      url: URL,
    });

    await expect(library.get("squat")).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });
});

describe("language", () => {
  const squat = exercise("squat", {
    translations: {
      uk: {
        description: "Про присід.",
        instructions: "Присідай.",
        name: "Присід",
      },
    },
  });
  const translatedLibrary = (exercises = [squat]) => {
    const api = stubApi(exercises);
    return {
      api,
      library: createLibrary({ fetch: api.fetch, token, url: URL }),
    };
  };

  it("sends it on get and answers in it", async () => {
    const { api, library } = translatedLibrary();

    const found = await library.get("squat", { language: "uk" });

    expect(api.requests[0]?.language).toBe("uk");
    expect(found).toMatchObject({ instructions: "Присідай.", name: "Присід" });
  });

  it("sends it on list with the other parameters", async () => {
    const { api, library } = translatedLibrary();

    const page = await library.list({ language: "uk", search: "прис" });

    expect(api.requests[0]?.language).toBe("uk");
    expect(api.requests[0]?.search).toBe("прис");
    expect(page.data.map((e) => e.name)).toEqual(["Присід"]);
  });

  it("sends it on every request a lookup is split into", async () => {
    const known = Array.from({ length: 85 }, (_, i) => exercise(`ex-${i}`));
    const { api, library } = translatedLibrary([squat, ...known]);

    const result = await library.lookup(
      ["squat", ...known.map((e) => e.slug)],
      { language: "uk" }
    );

    expect(api.requests).toHaveLength(3);
    expect(api.requests.map((request) => request.language)).toEqual([
      "uk",
      "uk",
      "uk",
    ]);
    expect(result.data[0]?.name).toBe("Присід");
    expect(result.missing).toEqual([]);
  });

  it("is never sent when not given, so the API answers in English", async () => {
    const { api, library } = translatedLibrary();

    const found = await library.get("squat");
    const page = await library.list({ search: "squat" });
    const batch = await library.lookup(["squat"]);

    expect(api.requests).toHaveLength(3);
    for (const request of api.requests) {
      expect(request.url.searchParams.has("language")).toBe(false);
    }
    expect(found?.name).toBe("Squat");
    expect(page.data[0]?.name).toBe("Squat");
    expect(batch.data[0]?.name).toBe("Squat");
  });
});

const errorBody = (code: string) =>
  ({ error: { code, message: code } }) as const;

describe("auth", () => {
  it("sends the bearer from token() on every request, asking for it each time", async () => {
    let calls = 0;
    const rotating = () => {
      calls += 1;
      return Promise.resolve(`token-${calls}`);
    };
    const slugs = Array.from({ length: 85 }, (_, i) => `ex-${i}`);
    const api = stubApi(slugs.map((slug) => exercise(slug)));
    const library = createLibrary({
      fetch: api.fetch,
      token: rotating,
      url: URL,
    });

    await library.lookup(slugs);
    await library.list();

    expect(api.requests.map((r) => r.authorization).sort()).toEqual([
      "Bearer token-1",
      "Bearer token-2",
      "Bearer token-3",
      "Bearer token-4",
    ]);
  });

  it("fails unauthorized without a request when there's no token", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token: () => Promise.resolve(null),
      url: URL,
    });

    await expect(library.list()).rejects.toBeInstanceOf(
      LibraryUnauthorizedError
    );
    expect(api.requests).toHaveLength(0);
  });

  it("fails unavailable when token() throws", async () => {
    const cause = new Error("offline");
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token: () => Promise.reject(cause),
      url: URL,
    });

    await expect(library.lookup(["squat"])).rejects.toMatchObject({
      cause,
      code: "unavailable",
    });
  });
  it("fails unavailable when token() throws before returning a promise", async () => {
    const cause = new Error("not loaded");
    const library = createLibrary({
      fetch: stubApi([exercise("squat")]).fetch,
      token: () => {
        throw cause;
      },
      url: URL,
    });

    await expect(library.list()).rejects.toMatchObject({
      cause,
      code: "unavailable",
    });
  });
});

describe("errors", () => {
  const failing = (respond: () => Response | Promise<Response>) =>
    createLibrary({
      fetch: stubApi([], respond).fetch,
      token,
      url: URL,
    });

  it("maps 401 to unauthorized", async () => {
    const library = failing(() =>
      Response.json(errorBody("unauthorized"), { status: 401 })
    );

    const error = await library.list().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LibraryUnauthorizedError);
    expect(error).toBeInstanceOf(LibraryError);
    expect(error).toMatchObject({ code: "unauthorized", status: 401 });
  });

  it("maps 429 to rate limited, carrying Retry-After seconds", async () => {
    const library = failing(() =>
      Response.json(errorBody("rate_limited"), {
        headers: { "Retry-After": "17" },
        status: 429,
      })
    );

    const error = await library.lookup(["squat"]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LibraryRateLimitedError);
    expect(error).toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 17,
    });
  });

  it("falls back to a minute when a 429 has no readable Retry-After", async () => {
    const library = failing(() =>
      Response.json(errorBody("rate_limited"), { status: 429 })
    );

    await expect(library.list()).rejects.toMatchObject({
      retryAfterSeconds: 60,
    });
  });

  it.each([500, 502, 503, 504])("maps %i to unavailable", async (status) => {
    const library = failing(() => new Response("oops", { status }));

    const error = await library.list().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LibraryUnavailableError);
    expect(error).toMatchObject({ code: "unavailable", status });
  });

  it("maps a network failure to unavailable, keeping the cause", async () => {
    const cause = new TypeError("Network request failed");
    const library = failing(() => Promise.reject(cause));

    await expect(library.lookup(["squat"])).rejects.toMatchObject({
      cause,
      code: "unavailable",
    });
  });

  it("maps a timeout to unavailable", async () => {
    const hanging = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      });
    const library = createLibrary({
      fetch: hanging,
      timeoutMs: 5,
      token,
      url: URL,
    });

    await expect(library.list()).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });

  it("maps an unreadable 200 to unavailable", async () => {
    const library = failing(() => new Response("<html>", { status: 200 }));

    await expect(library.list()).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });

  it.each([
    ["a page without total", { data: [], hasMore: false }],
    ["a page without hasMore", { data: [], total: 0 }],
    [
      "an entry that isn't an object",
      { data: [null], hasMore: false, total: 1 },
    ],
    [
      "an entry without a slug",
      { data: [{ name: "Squat" }], hasMore: false, total: 1 },
    ],
  ])("maps a 200 list answer with %s to unavailable", async (_, body) => {
    const library = failing(() => Response.json(body));

    await expect(library.list()).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });

  it.each([
    ["without missing", { data: [] }],
    ["with an entry that isn't an object", { data: [null], missing: [] }],
    ["with an empty entry", { data: [{}], missing: [] }],
    ["with a missing slug that isn't a string", { data: [], missing: [1] }],
  ])("maps a 200 lookup answer %s to unavailable", async (_, body) => {
    const library = failing(() => Response.json(body));

    await expect(library.lookup(["squat"])).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });

  it("maps 400 to invalid request, with the API's message", async () => {
    const library = failing(() =>
      Response.json(
        { error: { code: "invalid_request", message: "limit: Too big" } },
        { status: 400 }
      )
    );

    const error = await library.list({ limit: 51 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LibraryInvalidRequestError);
    expect(error).toMatchObject({
      code: "invalid_request",
      message: "limit: Too big",
      status: 400,
    });
  });

  it("fails a whole lookup when any chunk fails", async () => {
    let calls = 0;
    const library = failing(() => {
      calls += 1;
      return calls === 2
        ? Response.json(errorBody("rate_limited"), {
            headers: { "Retry-After": "5" },
            status: 429,
          })
        : Response.json({ data: [], missing: [] });
    });
    const slugs = Array.from({ length: 85 }, (_, i) => `ex-${i}`);

    await expect(library.lookup(slugs)).rejects.toBeInstanceOf(
      LibraryRateLimitedError
    );
  });
});

describe("covers", () => {
  const coversLibrary = (
    respond?: Parameters<typeof stubApi>[1],
    covers = [
      cover("3f2b8a4e-6c1d-4e5f-9a7b-1c2d3e4f5a6b", {
        muscle_groups: ["quadriceps", "glutes"],
      }),
      cover("0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d"),
    ]
  ) => {
    const api = stubApi([], respond, covers);
    return {
      api,
      covers,
      library: createLibrary({ fetch: api.fetch, token, url: URL }),
    };
  };

  it("answers every Cover from GET /covers, in the API's order, with the bearer", async () => {
    const { api, covers, library } = coversLibrary();

    expect(await library.covers()).toEqual(covers);
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]?.path).toBe("/covers");
    expect(api.requests[0]?.url.search).toBe("");
    expect(api.requests[0]?.authorization).toBe("Bearer secret-token");
  });

  it("answers an empty list for a Library without Covers", async () => {
    const { library } = coversLibrary(undefined, []);

    expect(await library.covers()).toEqual([]);
  });

  it("takes a muscle group it doesn't know, so a new one never breaks it", async () => {
    const fresh = cover("0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d", {
      muscle_groups: ["neck" as "chest"],
    });
    const { library } = coversLibrary(undefined, [fresh]);

    expect(await library.covers()).toEqual([fresh]);
  });

  it("maps 401 to unauthorized", async () => {
    const { library } = coversLibrary(() =>
      Response.json(errorBody("unauthorized"), { status: 401 })
    );

    await expect(library.covers()).rejects.toBeInstanceOf(
      LibraryUnauthorizedError
    );
  });

  it("maps 429 to rate limited, carrying Retry-After seconds", async () => {
    const { library } = coversLibrary(() =>
      Response.json(errorBody("rate_limited"), {
        headers: { "Retry-After": "9" },
        status: 429,
      })
    );

    const error = await library.covers().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LibraryRateLimitedError);
    expect(error).toMatchObject({ retryAfterSeconds: 9 });
  });

  it("maps a 5xx to unavailable", async () => {
    const { library } = coversLibrary(
      () => new Response("oops", { status: 503 })
    );

    await expect(library.covers()).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });

  it("maps a network failure to unavailable, keeping the cause", async () => {
    const cause = new TypeError("Network request failed");
    const { library } = coversLibrary(() => Promise.reject(cause));

    await expect(library.covers()).rejects.toMatchObject({
      cause,
      code: "unavailable",
    });
  });

  it("maps a timeout to unavailable", async () => {
    const hanging = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        );
      });
    const library = createLibrary({
      fetch: hanging,
      timeoutMs: 5,
      token,
      url: URL,
    });

    await expect(library.covers()).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });

  it("fails unauthorized without a request when there's no token", async () => {
    const api = stubApi([]);
    const library = createLibrary({
      fetch: api.fetch,
      token: () => Promise.resolve(null),
      url: URL,
    });

    await expect(library.covers()).rejects.toBeInstanceOf(
      LibraryUnauthorizedError
    );
    expect(api.requests).toHaveLength(0);
  });

  it.each([
    ["an unreadable body", () => new Response("<html>", { status: 200 })],
    ["no data", () => Response.json({})],
    ["data that isn't a list", () => Response.json({ data: {} })],
    ["an entry that isn't an object", () => Response.json({ data: [null] })],
    [
      "an entry without an id",
      () =>
        Response.json({
          data: [{ image_url: "https://media.test/c.jpg", muscle_groups: [] }],
        }),
    ],
    [
      "an entry without an image_url",
      () => Response.json({ data: [{ id: "c", muscle_groups: ["chest"] }] }),
    ],
    [
      "an entry whose muscle groups aren't strings",
      () =>
        Response.json({
          data: [
            {
              id: "c",
              image_url: "https://media.test/c.jpg",
              muscle_groups: [1],
            },
          ],
        }),
    ],
  ])("maps a 200 answer with %s to unavailable", async (_, respond) => {
    const { library } = coversLibrary(respond);

    await expect(library.covers()).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });
});

describe("url", () => {
  it("drops the trailing slashes of the API's origin", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: `${URL}///`,
    });

    await library.get("squat");

    expect(api.requests.map((request) => request.url.href)).toEqual([
      `${URL}/exercises/squat`,
    ]);
  });
});
