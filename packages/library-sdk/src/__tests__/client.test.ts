/// <reference lib="es2023.array" />
/// <reference lib="es2024.promise" />

import { describe, expect, it } from "vitest";

import {
  createLibrary,
  LibraryError,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
} from "..";
import { cover, stubApi } from "./stub-api";

const URL = "https://library.test";
const token = async () => await Promise.resolve("secret-token");

const COVERS = [
  cover("3f2b8a4e-6c1d-4e5f-9a7b-1c2d3e4f5a6b", {
    muscle_groups: ["quadriceps", "glutes"],
  }),
  cover("0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d"),
];

const coversLibrary = (
  respond?: Parameters<typeof stubApi>[1],
  covers = COVERS
) => {
  const api = stubApi(covers, respond);

  return {
    api,
    library: createLibrary({ fetch: api.fetch, token, url: URL }),
  };
};

const failing = (respond: () => Response | Promise<Response>) =>
  coversLibrary(respond).library;

const hanging = async (
  _input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const { promise, reject } = Promise.withResolvers<Response>();

  init?.signal?.addEventListener("abort", () => {
    reject(new DOMException("aborted", "AbortError"));
  });

  return await promise;
};

const errorBody = (code: string) =>
  ({ error: { code, message: code } }) as const;

describe("covers", () => {
  it("answers every Cover from GET /covers, in the API's order, with the bearer", async () => {
    const { api, library } = coversLibrary();

    await expect(library.covers()).resolves.toStrictEqual(COVERS);
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0]?.path).toBe("/covers");
    expect(api.requests[0]?.url.search).toBe("");
    expect(api.requests[0]?.authorization).toBe("Bearer secret-token");
  });

  it("answers an empty list for a Library without Covers", async () => {
    const { library } = coversLibrary(undefined, []);

    await expect(library.covers()).resolves.toStrictEqual([]);
  });

  it("takes a muscle group it doesn't know, so a new one never breaks it", async () => {
    const fresh = {
      ...cover("0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d"),
      muscle_groups: ["neck"],
    };

    const { library } = coversLibrary(() => Response.json({ data: [fresh] }));

    await expect(library.covers()).resolves.toStrictEqual([fresh]);
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
    await expect(failing(respond).covers()).rejects.toBeInstanceOf(
      LibraryUnavailableError
    );
  });
});

describe("auth", () => {
  it("sends the bearer from token() on every request, asking for it each time", async () => {
    let calls = 0;

    const rotating = async () => {
      calls += 1;

      return await Promise.resolve(`token-${calls}`);
    };

    const api = stubApi(COVERS);

    const library = createLibrary({
      fetch: api.fetch,
      token: rotating,
      url: URL,
    });

    await library.covers();
    await library.covers();

    expect(api.requests.map((r) => r.authorization)).toStrictEqual([
      "Bearer token-1",
      "Bearer token-2",
    ]);
  });

  it("fails unauthorized without a request when there's no token", async () => {
    const api = stubApi(COVERS);

    const library = createLibrary({
      fetch: api.fetch,
      token: async () => await Promise.resolve(null),
      url: URL,
    });

    await expect(library.covers()).rejects.toBeInstanceOf(
      LibraryUnauthorizedError
    );
    expect(api.requests).toHaveLength(0);
  });

  it("fails unavailable when token() throws", async () => {
    const cause = new Error("offline");

    const library = createLibrary({
      fetch: stubApi(COVERS).fetch,
      token: async () => await Promise.reject(cause),
      url: URL,
    });

    await expect(library.covers()).rejects.toMatchObject({
      cause,
      code: "unavailable",
    });
  });

  it("fails unavailable when token() throws before returning a promise", async () => {
    const cause = new Error("not loaded");

    const library = createLibrary({
      fetch: stubApi(COVERS).fetch,
      token: () => {
        throw cause;
      },
      url: URL,
    });

    await expect(library.covers()).rejects.toMatchObject({
      cause,
      code: "unavailable",
    });
  });
});

describe("errors", () => {
  it("maps 401 to unauthorized", async () => {
    const result = failing(() =>
      Response.json(errorBody("unauthorized"), { status: 401 })
    ).covers();

    await expect(result).rejects.toBeInstanceOf(LibraryUnauthorizedError);
    await expect(result).rejects.toBeInstanceOf(LibraryError);
    await expect(result).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
  });

  it("maps 429 to rate limited, carrying Retry-After seconds", async () => {
    const result = failing(() =>
      Response.json(errorBody("rate_limited"), {
        headers: { "Retry-After": "17" },
        status: 429,
      })
    ).covers();

    await expect(result).rejects.toBeInstanceOf(LibraryRateLimitedError);
    await expect(result).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 17,
    });
  });

  it("falls back to a minute when a 429 has no readable Retry-After", async () => {
    const library = failing(() =>
      Response.json(errorBody("rate_limited"), { status: 429 })
    );

    await expect(library.covers()).rejects.toMatchObject({
      retryAfterSeconds: 60,
    });
  });

  it.each([500, 502, 503, 504])("maps %i to unavailable", async (status) => {
    const result = failing(() => new Response("oops", { status })).covers();

    await expect(result).rejects.toBeInstanceOf(LibraryUnavailableError);
    await expect(result).rejects.toMatchObject({ code: "unavailable", status });
  });

  it("maps a network failure to unavailable, keeping the cause", async () => {
    const cause = new TypeError("Network request failed");

    const library = failing(async () => await Promise.reject(cause));

    await expect(library.covers()).rejects.toMatchObject({
      cause,
      code: "unavailable",
    });
  });

  it("maps a timeout to unavailable", async () => {
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

  it("maps 400 to invalid request, with the API's message", async () => {
    const result = failing(() =>
      Response.json(
        { error: { code: "invalid_request", message: "language: Invalid" } },
        { status: 400 }
      )
    ).covers();

    await expect(result).rejects.toBeInstanceOf(LibraryInvalidRequestError);
    await expect(result).rejects.toMatchObject({
      code: "invalid_request",
      message: "language: Invalid",
      status: 400,
    });
  });
});

describe("url", () => {
  it("drops the trailing slashes of the API's origin", async () => {
    const api = stubApi(COVERS);

    const library = createLibrary({
      fetch: api.fetch,
      token,
      url: `${URL}///`,
    });

    await library.covers();

    expect(api.requests.map((request) => request.url.href)).toStrictEqual([
      `${URL}/covers`,
    ]);
  });
});
