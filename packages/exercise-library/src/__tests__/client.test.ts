import { describe, expect, it } from "vitest";
import {
  createExerciseLibrary,
  ExerciseLibraryError,
  ExerciseLibraryInvalidRequestError,
  ExerciseLibraryRateLimitedError,
  ExerciseLibraryUnauthorizedError,
  ExerciseLibraryUnavailableError,
} from "..";
import { exercise, stubApi } from "./stub-api";

const URL = "https://exercises.test";
const token = () => Promise.resolve("secret-token");

describe("lookup", () => {
  it("asks for 85 slugs in 3 requests of at most 40, in asked order, missing merged", async () => {
    const known = Array.from({ length: 80 }, (_, i) => exercise(`ex-${i}`));
    const api = stubApi(known);
    const library = createExerciseLibrary({
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
    const library = createExerciseLibrary({
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
    const library = createExerciseLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    expect(await library.lookup([])).toEqual({ data: [], missing: [] });
    expect(api.requests).toHaveLength(0);
  });

  it("answers a slug that can't be sent (empty, or with a comma) as missing", async () => {
    const api = stubApi([exercise("squat")]);
    const library = createExerciseLibrary({
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
    const library = createExerciseLibrary({
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
    const library = createExerciseLibrary({
      fetch: api.fetch,
      token,
      url: URL,
    });

    const page = await library.list();

    expect([...(api.requests[0]?.url.searchParams.keys() ?? [])]).toEqual([]);
    expect(page).toMatchObject({ hasMore: false, total: 1 });
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
    const library = createExerciseLibrary({
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
    const library = createExerciseLibrary({
      fetch: api.fetch,
      token: () => Promise.resolve(null),
      url: URL,
    });

    await expect(library.list()).rejects.toBeInstanceOf(
      ExerciseLibraryUnauthorizedError
    );
    expect(api.requests).toHaveLength(0);
  });

  it("fails unavailable when token() throws", async () => {
    const cause = new Error("offline");
    const api = stubApi([exercise("squat")]);
    const library = createExerciseLibrary({
      fetch: api.fetch,
      token: () => Promise.reject(cause),
      url: URL,
    });

    await expect(library.lookup(["squat"])).rejects.toMatchObject({
      cause,
      code: "unavailable",
    });
  });
});

describe("errors", () => {
  const failing = (respond: () => Response | Promise<Response>) =>
    createExerciseLibrary({
      fetch: stubApi([], respond).fetch,
      token,
      url: URL,
    });

  it("maps 401 to unauthorized", async () => {
    const library = failing(() =>
      Response.json(errorBody("unauthorized"), { status: 401 })
    );

    const error = await library.list().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExerciseLibraryUnauthorizedError);
    expect(error).toBeInstanceOf(ExerciseLibraryError);
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

    expect(error).toBeInstanceOf(ExerciseLibraryRateLimitedError);
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

    expect(error).toBeInstanceOf(ExerciseLibraryUnavailableError);
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
    const library = createExerciseLibrary({
      fetch: hanging,
      timeoutMs: 5,
      token,
      url: URL,
    });

    await expect(library.list()).rejects.toBeInstanceOf(
      ExerciseLibraryUnavailableError
    );
  });

  it("maps an unreadable 200 to unavailable", async () => {
    const library = failing(() => new Response("<html>", { status: 200 }));

    await expect(library.list()).rejects.toBeInstanceOf(
      ExerciseLibraryUnavailableError
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

    expect(error).toBeInstanceOf(ExerciseLibraryInvalidRequestError);
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
      ExerciseLibraryRateLimitedError
    );
  });
});
