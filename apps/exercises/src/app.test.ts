import { muscleGroups } from "@fitme/core/models";
import { describe, expect, it, vi } from "vitest";
import type { BundleExercise as LibraryExercise } from "./bundle";
import { type AppDeps, createApp } from "./create-app";
import {
  memoryRateLimiter,
  type RateLimiter,
  rateLimiterFromEnv,
} from "./rate-limit";
import type { ExerciseBatch, ExercisePage } from "./schemas";
import { serveLibrary } from "./served-library";
import { clerkInstance, clerkToken } from "./test/clerk";
import { fakeOid, libraryExercise } from "./test/fixtures";

const SUPABASE_URL = "https://project.supabase.co";

/** The library hash, a sha256, quoted. */
const LIBRARY_ETAG = /^"[0-9a-f]{64}"$/;

const COACH_SECRET = "c".repeat(32);
const MCP_SECRET = "m".repeat(64);
const API_SECRET = "a".repeat(48);

/** Each server caller with its secret. */
const SERVER_SECRETS = [
  ["api", API_SECRET],
  ["coach", COACH_SECRET],
  ["mcp", MCP_SECRET],
] as const;

const production = clerkInstance();
const development = clerkInstance();

const auth: AppDeps["auth"] = {
  clerkJwtKeys: {
    development: development.jwtKey,
    production: production.jwtKey,
  },
  serverSecrets: { api: API_SECRET, coach: COACH_SECRET, mcp: MCP_SECRET },
};

/** A limiter that never refuses, for tests that aren't about limits. */
const unlimited: RateLimiter = {
  limit: () => Promise.resolve({ allowed: true }),
};

/** The deps every test app shares: no limits, no one identified, errors dropped. */
const base = {
  auth,
  identifyUser: () => undefined,
  rateLimiter: unlimited,
  reportError: () => Promise.resolve(),
};

const app = createApp({
  ...base,
  library: serveLibrary(
    {
      exercises: [
        libraryExercise("bench-press", "Bench Press"),
        libraryExercise("squat", "Squat"),
      ],
    },
    SUPABASE_URL
  ),
});

const asUser = {
  headers: {
    authorization: `Bearer ${clerkToken(production.privateKey, { sub: "user_alice" })}`,
  },
};

/** An app whose `/caller` route answers the caller auth resolved. */
const callerApp = (deps: Partial<AppDeps> = {}) =>
  createApp({
    ...base,
    library: serveLibrary({ exercises: [] }, SUPABASE_URL),
    ...deps,
  }).get("/caller", (c) => c.json(c.get("caller")));

const bearer = (token: string) => ({
  headers: { authorization: `Bearer ${token}` },
});

const unauthorized = {
  error: {
    code: "unauthorized",
    message: "A Clerk session token or a server secret is required",
  },
};

/** An app serving an empty Exercise Library, for adding test routes to. */
const emptyApp = () =>
  createApp({
    ...base,
    library: serveLibrary({ exercises: [] }, SUPABASE_URL),
  });

const currentEtag = async () => {
  const etag = (
    await app.request("/exercises/bench-press", asUser)
  ).headers.get("ETag");
  if (!etag) {
    throw new Error("no ETag");
  }
  return etag;
};

const listApp = createApp({
  ...base,
  library: serveLibrary(
    {
      // sorted by Exercise slug, as the bundle lists them
      exercises: [
        libraryExercise("bench-press", "Bench Press", ["chest", "triceps"]),
        libraryExercise("deadlift", "Deadlift", ["back", "hamstrings"]),
        libraryExercise("front-squat", "squat (front)", ["quadriceps"]),
        libraryExercise("pull-up", "Pull-Up", ["lats", "biceps"]),
        libraryExercise("squat", "Back Squat", ["quadriceps", "glutes"]),
      ],
    },
    SUPABASE_URL
  ),
});

const list = async (query = "") => {
  const response = await listApp.request(`/exercises${query}`, asUser);
  // an error body (400) is asserted with toEqual, which takes any shape
  const body = (await response.json()) as ExercisePage;
  return { body, status: response.status };
};

const names = (body: ExercisePage) =>
  body.data.map((exercise) => exercise.name);

describe("auth", () => {
  it("answers a content route without a token with 401", async () => {
    const response = await app.request("/exercises/bench-press");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(unauthorized);
  });

  it("checks the token before answering 304", async () => {
    const etag = await currentEtag();

    const response = await app.request("/exercises/squat", {
      headers: { "If-None-Match": etag },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("ETag")).toBeNull();
  });

  it("resolves the User from a production Clerk token", async () => {
    const response = await callerApp().request("/caller", asUser);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      type: "user",
      userId: "user_alice",
    });
  });

  it("resolves the User from a development Clerk token", async () => {
    const response = await callerApp().request(
      "/caller",
      bearer(clerkToken(development.privateKey, { sub: "user_bob" }))
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ type: "user", userId: "user_bob" });
  });

  it.each([
    ["a garbage token", { authorization: "Bearer not-a-jwt" }],
    ["a non-bearer scheme", { authorization: `Basic ${COACH_SECRET}` }],
    [
      "an expired token",
      {
        authorization: `Bearer ${clerkToken(production.privateKey, {
          exp: Math.floor(Date.now() / 1000) - 60,
          sub: "user_alice",
        })}`,
      },
    ],
    [
      "a token signed by an unknown key",
      {
        authorization: `Bearer ${clerkToken(clerkInstance().privateKey, {
          sub: "user_alice",
        })}`,
      },
    ],
    [
      "a token without a session (a JWT template's)",
      {
        authorization: `Bearer ${clerkToken(production.privateKey, {
          sid: undefined,
          sub: "user_alice",
        })}`,
      },
    ],
    ["a wrong secret", { authorization: `Bearer ${"x".repeat(32)}` }],
  ])("answers %s with 401", async (_case, headers) => {
    const response = await app.request("/exercises/bench-press", { headers });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(unauthorized);
  });

  it.each(SERVER_SECRETS)(
    "resolves the %s server caller from its secret",
    async (name, secret) => {
      const response = await callerApp().request("/caller", bearer(secret));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ name, type: "server" });
    }
  );

  it("accepts nothing with a secret under 32 characters", async () => {
    const short = "s".repeat(31);
    const response = await callerApp({
      auth: {
        ...auth,
        serverSecrets: { api: short, coach: short, mcp: short },
      },
    }).request("/caller", bearer(short));

    expect(response.status).toBe(401);
  });

  it("accepts nothing with an unset secret", async () => {
    const response = await callerApp({
      auth: { ...auth, serverSecrets: {} },
    }).request("/caller", bearer(COACH_SECRET));

    expect(response.status).toBe(401);
  });

  it.each(
    SERVER_SECRETS.flatMap(
      ([name, secret]) =>
        [
          ["unset", name, secret, undefined],
          ["under 32 characters", name, secret, secret.slice(0, 31)],
        ] as const
    )
  )(
    "refuses a secret %s for the %s caller only",
    async (_case, name, secret, configured) => {
      const configuredApp = callerApp({
        auth: {
          ...auth,
          serverSecrets: { ...auth.serverSecrets, [name]: configured },
        },
      });
      const statusFor = async (request: ReturnType<typeof bearer>) =>
        (await configuredApp.request("/caller", request)).status;
      const otherSecrets = SERVER_SECRETS.filter(([other]) => other !== name);

      expect(await statusFor(bearer(secret))).toBe(401);
      if (configured) {
        expect(await statusFor(bearer(configured))).toBe(401);
      }
      const stillAccepted = await Promise.all(
        [...otherSecrets.map(([, other]) => bearer(other)), asUser].map(
          statusFor
        )
      );
      expect(stillAccepted.every((status) => status === 200)).toBe(true);
    }
  );

  it("accepts no Clerk token with no Clerk keys", async () => {
    const response = await callerApp({
      auth: { ...auth, clerkJwtKeys: {} },
    }).request("/caller", asUser);

    expect(response.status).toBe(401);
  });
});

describe("error reporting identity", () => {
  /** An app recording every User it identifies to error reporting. */
  const identifyingApp = () => {
    const identified: string[] = [];
    const identifying = callerApp({
      identifyUser: (userId) => {
        identified.push(userId);
      },
    });
    return { identified, identifying };
  };

  it("identifies a User by their Clerk id", async () => {
    const { identified, identifying } = identifyingApp();

    const response = await identifying.request("/caller", asUser);

    expect(response.status).toBe(200);
    expect(identified).toEqual(["user_alice"]);
  });

  it.each(SERVER_SECRETS)(
    "identifies no User for the %s server caller",
    async (_name, secret) => {
      const { identified, identifying } = identifyingApp();

      const response = await identifying.request("/caller", bearer(secret));

      expect(response.status).toBe(200);
      expect(identified).toEqual([]);
    }
  );

  it("identifies no one for a refused request", async () => {
    const { identified, identifying } = identifyingApp();

    const response = await identifying.request("/caller");

    expect(response.status).toBe(401);
    expect(identified).toEqual([]);
  });
});

describe("OpenAPI spec", () => {
  it("declares bearer auth on every content route, not on /health", () => {
    const spec = app.getOpenAPIDocument({
      info: { title: "test", version: "0" },
      openapi: "3.0.3",
    });

    expect(spec.components?.securitySchemes).toMatchObject({
      bearerAuth: { scheme: "bearer", type: "http" },
    });
    expect(spec.paths["/exercises"]?.get?.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(spec.paths["/exercises/{slug}"]?.get?.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(spec.paths["/health"]?.get?.security).toBeUndefined();
  });
});

describe("GET /exercises", () => {
  it("lists every Exercise alphabetically by name, as summaries", async () => {
    const { body, status } = await list();

    expect(status).toBe(200);
    expect(names(body)).toEqual([
      "Back Squat",
      "Bench Press",
      "Deadlift",
      "Pull-Up",
      "squat (front)",
    ]);
    expect(body.total).toBe(5);
    expect(body.hasMore).toBe(false);
    expect(body.data[0]).toEqual({
      muscle_groups: ["quadriceps", "glutes"],
      name: "Back Squat",
      slug: "squat",
      thumbnail_url: `https://project.supabase.co/storage/v1/render/image/public/exercise-media/squat/${fakeOid("a")}.png`,
      video_url: `https://project.supabase.co/storage/v1/object/public/exercise-media/squat/${fakeOid("b")}.mp4`,
    });
  });
});

describe("GET /exercises search", () => {
  it("matches the name case-insensitively, anywhere in it", async () => {
    const { body } = await list("?search=SQU");

    expect(names(body)).toEqual(["Back Squat", "squat (front)"]);
    expect(body).toMatchObject({ hasMore: false, total: 2 });
  });

  it("counts every match in total, not just the page", async () => {
    const { body } = await list("?search=squat&limit=1");

    expect(names(body)).toEqual(["Back Squat"]);
    expect(body).toMatchObject({ hasMore: true, total: 2 });
  });

  it("treats % and _ as literal characters", async () => {
    const wildcardApp = createApp({
      ...base,
      library: serveLibrary(
        {
          exercises: [
            libraryExercise("bench-press", "Bench Press"),
            libraryExercise("percent", "100% Effort"),
            libraryExercise("underscore", "Snake_Walk"),
          ],
        },
        SUPABASE_URL
      ),
    });
    const search = async (term: string) =>
      names(
        (await (
          await wildcardApp.request(
            `/exercises?search=${encodeURIComponent(term)}`,
            asUser
          )
        ).json()) as ExercisePage
      );

    expect(await search("%")).toEqual(["100% Effort"]);
    expect(await search("_")).toEqual(["Snake_Walk"]);
    expect(await search("e_w")).toEqual(["Snake_Walk"]);
    expect(await search("b%s")).toEqual([]);
  });

  it("ignores surrounding whitespace, and lists everything for a blank search", async () => {
    expect(names((await list("?search=%20press%20")).body)).toEqual([
      "Bench Press",
    ]);
    expect((await list("?search=%20%20")).body.total).toBe(5);
  });

  it("answers a search over 100 characters with 400", async () => {
    const { status } = await list(`?search=${"a".repeat(101)}`);

    expect(status).toBe(400);
  });

  it("answers no match with an empty page", async () => {
    expect((await list("?search=row")).body).toEqual({
      data: [],
      hasMore: false,
      total: 0,
    });
  });
});

describe("GET /exercises muscle group filter", () => {
  it("lists only Exercises with that muscle group", async () => {
    const { body } = await list("?muscle_group=quadriceps");

    expect(names(body)).toEqual(["Back Squat", "squat (front)"]);
    expect(body).toMatchObject({ hasMore: false, total: 2 });
  });

  it("combines with search", async () => {
    const { body } = await list("?muscle_group=quadriceps&search=back");

    expect(names(body)).toEqual(["Back Squat"]);
  });

  it("answers a known muscle group no Exercise has with an empty page", async () => {
    expect((await list("?muscle_group=calves")).body).toEqual({
      data: [],
      hasMore: false,
      total: 0,
    });
  });

  it("answers an unknown muscle group with 400 in the error shape", async () => {
    const { body, status } = await list("?muscle_group=neck");

    expect(status).toBe(400);
    expect(body).toEqual({
      error: { code: "invalid_request", message: expect.any(String) },
    });
  });

  it("is an enum of every muscle group in the OpenAPI definition", () => {
    const document = listApp.getOpenAPIDocument({
      info: { title: "Exercise Library API", version: "1" },
      openapi: "3.1.0",
    });
    const parameter = document.paths["/exercises"]?.get?.parameters?.find(
      (p) => "name" in p && p.name === "muscle_group"
    );

    expect(parameter).toMatchObject({
      in: "query",
      schema: { $ref: "#/components/schemas/MuscleGroup" },
    });
    expect(document.components?.schemas?.MuscleGroup).toEqual({
      enum: [...muscleGroups],
      type: "string",
    });
  });
});

describe("GET /exercises pagination", () => {
  it("pages with limit and offset, with total and hasMore across pages", async () => {
    const first = await list("?limit=2");
    const middle = await list("?limit=2&offset=2");
    const last = await list("?limit=2&offset=4");

    expect(names(first.body)).toEqual(["Back Squat", "Bench Press"]);
    expect(first.body).toMatchObject({ hasMore: true, total: 5 });
    expect(names(middle.body)).toEqual(["Deadlift", "Pull-Up"]);
    expect(middle.body).toMatchObject({ hasMore: true, total: 5 });
    expect(names(last.body)).toEqual(["squat (front)"]);
    expect(last.body).toMatchObject({ hasMore: false, total: 5 });
  });

  it("answers an offset past the end with an empty page", async () => {
    const { body, status } = await list("?offset=10");

    expect(status).toBe(200);
    expect(body).toEqual({ data: [], hasMore: false, total: 5 });
  });

  it("serves 20 Exercises by default", async () => {
    const slugs = Array.from(
      { length: 21 },
      (_, i) => `exercise-${String(i).padStart(2, "0")}`
    );
    const big = createApp({
      ...base,
      library: serveLibrary(
        { exercises: slugs.map((slug) => libraryExercise(slug, slug)) },
        SUPABASE_URL
      ),
    });

    const body = (await (
      await big.request("/exercises", asUser)
    ).json()) as ExercisePage;

    expect(body.data).toHaveLength(20);
    expect(body).toMatchObject({ hasMore: true, total: 21 });
  });

  it.each(["?limit=0", "?limit=51", "?limit=2.5", "?limit=abc", "?offset=-1"])(
    "answers %s with 400 in the error shape",
    async (query) => {
      const { body, status } = await list(query);

      expect(status).toBe(400);
      expect(body).toEqual({
        error: { code: "invalid_request", message: expect.any(String) },
      });
    }
  );

  it("accepts the limit bounds", async () => {
    expect((await list("?limit=1")).body.data).toHaveLength(1);
    expect((await list("?limit=50")).status).toBe(200);
  });
});

const batch = async (slugs: string, rest = "") => {
  const { body, status } = await list(`?slugs=${slugs}${rest}`);
  return { body: body as unknown as ExerciseBatch, status };
};

describe("GET /exercises?slugs (batch lookup)", () => {
  it("answers known Exercise slugs in request order, as summaries, and lists unknown ones as missing", async () => {
    const { body, status } = await batch("squat,nope,bench-press,gone");

    expect(status).toBe(200);
    expect(body.data.map((exercise) => exercise.slug)).toEqual([
      "squat",
      "bench-press",
    ]);
    expect(body.missing).toEqual(["nope", "gone"]);
    expect(body.data[0]).toEqual({
      muscle_groups: ["quadriceps", "glutes"],
      name: "Back Squat",
      slug: "squat",
      thumbnail_url: `https://project.supabase.co/storage/v1/render/image/public/exercise-media/squat/${fakeOid("a")}.png`,
      video_url: `https://project.supabase.co/storage/v1/object/public/exercise-media/squat/${fakeOid("b")}.mp4`,
    });
  });

  it("answers a repeated Exercise slug once, where it first appears", async () => {
    const { body } = await batch("squat,nope,deadlift,squat,nope");

    expect(body.data.map((exercise) => exercise.slug)).toEqual([
      "squat",
      "deadlift",
    ]);
    expect(body.missing).toEqual(["nope"]);
  });

  const slugList = (count: number) =>
    Array.from({ length: count }, (_, i) => `exercise-${i}`).join(",");

  it("looks up at most 40 Exercise slugs", async () => {
    expect((await batch(slugList(40))).body.missing).toHaveLength(40);
  });

  it.each([
    ["41 Exercise slugs", slugList(41)],
    ["41 Exercise slugs with a repeat", `${slugList(40)},exercise-0`],
    ["an empty slugs", ""],
    ["an empty Exercise slug in the list", "squat,,deadlift"],
  ])("answers %s with 400 in the error shape", async (_, slugs) => {
    const { body, status } = await batch(slugs);

    expect(status).toBe(400);
    expect(body).toEqual({
      error: { code: "invalid_request", message: expect.any(String) },
    });
  });

  it.each([
    "&search=squat",
    "&search=",
    "&muscle_group=quadriceps",
    "&limit=20",
    "&offset=0",
  ])(
    "answers slugs combined with %s with 400 in the error shape",
    async (rest) => {
      const { body, status } = await batch("squat", rest);

      expect(status).toBe(400);
      expect(body).toEqual({
        error: { code: "invalid_request", message: expect.any(String) },
      });
    }
  );

  it("lets devices cache a batch, tagged with the library hash", async () => {
    const response = await listApp.request("/exercises?slugs=squat", asUser);

    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(response.headers.get("ETag")).toMatch(LIBRARY_ETAG);
  });

  it("shows both response shapes of GET /exercises, and slugs as a string, in the OpenAPI definition", () => {
    const document = listApp.getOpenAPIDocument({
      info: { title: "Exercise Library API", version: "1" },
      openapi: "3.1.0",
    });
    const get = document.paths["/exercises"]?.get;
    const parameter = get?.parameters?.find(
      (p) => "name" in p && p.name === "slugs"
    );
    const ok = get?.responses?.["200"];

    expect(parameter).toMatchObject({
      in: "query",
      required: false,
      schema: { type: "string" },
    });
    expect(
      ok && "content" in ok && ok.content?.["application/json"]?.schema
    ).toEqual({
      anyOf: [
        { $ref: "#/components/schemas/ExercisePage" },
        { $ref: "#/components/schemas/ExerciseBatch" },
      ],
    });
    expect(document.components?.schemas?.ExerciseBatch).toMatchObject({
      properties: {
        data: {
          items: { $ref: "#/components/schemas/ExerciseSummary" },
          type: "array",
        },
        missing: { items: { type: "string" }, type: "array" },
      },
      required: ["data", "missing"],
      type: "object",
    });
  });
});

describe("GET /exercises/:slug", () => {
  it("answers the full Exercise", async () => {
    const response = await app.request("/exercises/bench-press", asUser);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      description: "Bench Press is a compound pushing movement.\n",
      instructions: "1. Lie on the bench.\n2. Press.\n",
      muscle_groups: ["chest", "triceps"],
      name: "Bench Press",
      slug: "bench-press",
      thumbnail_url: `https://project.supabase.co/storage/v1/render/image/public/exercise-media/bench-press/${fakeOid("a")}.png`,
      video_url: `https://project.supabase.co/storage/v1/object/public/exercise-media/bench-press/${fakeOid("b")}.mp4`,
    });
  });

  it("answers an unknown Exercise slug with 404 in the error shape", async () => {
    const response = await app.request("/exercises/deadlift", asUser);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Exercise not found" },
    });
  });
});

describe("device caching", () => {
  it("lets devices cache a content response for an hour, tagged with the library hash", async () => {
    const response = await app.request("/exercises/bench-press", asUser);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(response.headers.get("ETag")).toMatch(LIBRARY_ETAG);
  });

  it("answers 304 with no body when If-None-Match holds the current ETag", async () => {
    const etag = await currentEtag();

    const response = await app.request("/exercises/squat", {
      headers: { ...asUser.headers, "If-None-Match": etag },
    });

    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe(etag);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
  });

  it("keeps the headers the 200 would carry on a 304, except its body's", async () => {
    // a path no real route takes, under the content routes
    const withVary = emptyApp().get("/exercises/test/vary", (c) => {
      c.header("Vary", "Authorization");
      return c.json({ data: [] });
    });

    const response = await withVary.request("/exercises/test/vary", {
      headers: { ...asUser.headers, "If-None-Match": "*" },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(response.headers.get("Content-Type")).toBeNull();
  });

  it.each([
    ["one of several", (etag: string) => `"old", ${etag}`],
    ["weak", (etag: string) => `W/${etag}`],
    ["*", () => "*"],
  ])("answers 304 when If-None-Match is %s", async (_, ifNoneMatch) => {
    const etag = await currentEtag();

    const response = await app.request("/exercises/squat", {
      headers: { ...asUser.headers, "If-None-Match": ifNoneMatch(etag) },
    });

    expect(response.status).toBe(304);
  });

  it("answers normally when If-None-Match holds another ETag", async () => {
    const response = await app.request("/exercises/squat", {
      headers: { ...asUser.headers, "If-None-Match": `"${"0".repeat(64)}"` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ slug: "squat" });
  });

  it("applies to every content route, including ones added later", async () => {
    const withLater = emptyApp().get("/exercises/later/route", (c) =>
      c.json({ data: [] })
    );

    const later = await withLater.request("/exercises/later/route", asUser);
    const listed = await withLater.request("/exercises", asUser);

    expect(later.headers.get("ETag")).toMatch(LIBRARY_ETAG);
    expect(listed.headers.get("ETag")).toMatch(LIBRARY_ETAG);
  });

  it("keeps errors uncacheable, even with a matching If-None-Match", async () => {
    const etag = await currentEtag();
    const failing = emptyApp().get("/exercises/boom/now", () => {
      throw new Error("boom");
    });
    const responses = [
      await app.request("/exercises/deadlift", {
        headers: { ...asUser.headers, "If-None-Match": etag },
      }),
      await app.request("/exercises/squat/nope", asUser),
      await failing.request("/exercises/boom/now", asUser),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 500,
    ]);
    for (const response of responses) {
      expect(response.headers.get("ETag")).toBeNull();
      expect(response.headers.get("Cache-Control")).toBeNull();
    }
  });

  it("doesn't cache /health", async () => {
    const response = await app.request("/health");

    expect(response.headers.get("ETag")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it.each([
    [
      "a name",
      (exercise: LibraryExercise) => ({
        ...exercise,
        locales: { en: { ...exercise.locales.en, name: "Flat Bench Press" } },
      }),
    ],
    [
      "a description",
      (exercise: LibraryExercise) => ({
        ...exercise,
        locales: { en: { ...exercise.locales.en, description: "Pressing.\n" } },
      }),
    ],
    [
      "muscle groups",
      (exercise: LibraryExercise) => ({
        ...exercise,
        muscle_groups: ["chest" as const],
      }),
    ],
    [
      "a thumbnail",
      (exercise: LibraryExercise) => ({
        ...exercise,
        thumbnail: { ...exercise.thumbnail, oid: fakeOid("c") },
      }),
    ],
    [
      "a video",
      (exercise: LibraryExercise) => ({
        ...exercise,
        video: { ...exercise.video, oid: fakeOid("c") },
      }),
    ],
  ])("changes the ETag when %s changes", async (_, change) => {
    const etag = await currentEtag();
    const changed = createApp({
      ...base,
      library: serveLibrary(
        {
          exercises: [
            change(libraryExercise("bench-press", "Bench Press")),
            libraryExercise("squat", "Squat"),
          ],
        },
        SUPABASE_URL
      ),
    });

    const response = await changed.request("/exercises/squat", {
      headers: { ...asUser.headers, "If-None-Match": etag },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toMatch(LIBRARY_ETAG);
    expect(response.headers.get("ETag")).not.toBe(etag);
  });
});

describe("CORS", () => {
  const origin = "https://app.fitmeproject.com";

  it("answers a preflight before auth, allowing the Authorization header", async () => {
    const response = await app.request("/exercises/bench-press", {
      headers: {
        "Access-Control-Request-Headers": "authorization,if-none-match",
        "Access-Control-Request-Method": "GET",
        Origin: origin,
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET"
    );
    expect(
      response.headers.get("Access-Control-Allow-Headers")?.toLowerCase()
    ).toContain("authorization");
  });

  it("lets a browser read responses, errors included", async () => {
    const responses = [
      await app.request("/exercises/bench-press", {
        headers: { ...asUser.headers, Origin: origin },
      }),
      await app.request("/exercises/bench-press", {
        headers: { Origin: origin },
      }),
    ];

    expect(responses.map((response) => response.status)).toEqual([200, 401]);
    for (const response of responses) {
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    }
  });
});

describe("GET /health", () => {
  it("is public", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("errors", () => {
  it("answers an unknown route with a JSON 404", async () => {
    const response = await app.request("/nope", asUser);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Route not found" },
    });
  });

  it("reports a thrown error and answers a JSON 500", async () => {
    const reported: unknown[] = [];
    const boom = new Error("boom");
    const failing = createApp({
      ...base,
      library: serveLibrary({ exercises: [] }, SUPABASE_URL),
      reportError: (error) => {
        reported.push(error);
        return Promise.resolve();
      },
    }).get("/boom", () => {
      throw boom;
    });

    const response = await failing.request("/boom", asUser);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal_error", message: "Internal server error" },
    });
    expect(reported).toEqual([boom]);
  });
});

const MINUTE_MS = 60_000;

/** An app serving one Exercise, limited by `rateLimiter`, recording what it reports. */
const limitedApp = (rateLimiter: RateLimiter) => {
  const reported: unknown[] = [];
  const limited = createApp({
    ...base,
    library: serveLibrary(
      { exercises: [libraryExercise("squat", "Squat")] },
      SUPABASE_URL
    ),
    rateLimiter,
    reportError: (error) => {
      reported.push(error);
      return Promise.resolve();
    },
  });
  return { limited, reported };
};

/** A clock tests move by hand. */
const fakeClock = (start = Date.UTC(2026, 9, 18)) => {
  let time = start;
  return {
    advance: (ms: number) => {
      time += ms;
    },
    now: () => time,
  };
};

const requestTimes = async (
  target: { request: typeof app.request },
  times: number,
  init: RequestInit = asUser
) => {
  const statuses: number[] = [];
  for (let i = 0; i < times; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one at a time, so the statuses come back in the order they were counted
    statuses.push((await target.request("/exercises/squat", init)).status);
  }
  return statuses;
};

describe("rate limiting", () => {
  it("answers a User's 121st request within a minute with 429 and Retry-After", async () => {
    const clock = fakeClock();
    const { limited } = limitedApp(memoryRateLimiter({ now: clock.now }));

    const statuses = await requestTimes(limited, 120);
    clock.advance(45_000);
    const response = await limited.request("/exercises/squat", asUser);

    expect(statuses.every((status) => status === 200)).toBe(true);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(response.headers.get("ETag")).toBeNull();
    expect(await response.json()).toEqual({
      error: {
        code: "rate_limited",
        message:
          "Too many requests, retry after the Retry-After header's seconds",
      },
    });
  });

  it("resets the window after a minute", async () => {
    const clock = fakeClock();
    const { limited } = limitedApp(memoryRateLimiter({ now: clock.now }));

    await requestTimes(limited, 121);
    clock.advance(MINUTE_MS);

    expect(await requestTimes(limited, 120)).toEqual(new Array(120).fill(200));
  });

  it("counts each User separately", async () => {
    const clock = fakeClock();
    const { limited } = limitedApp(memoryRateLimiter({ now: clock.now }));

    await requestTimes(limited, 121);
    const response = await limited.request(
      "/exercises/squat",
      bearer(clerkToken(production.privateKey, { sub: "user_bob" }))
    );

    expect(response.status).toBe(200);
  });

  it("counts a 304 too", async () => {
    const clock = fakeClock();
    const { limited } = limitedApp(memoryRateLimiter({ now: clock.now }));
    const etag = (
      await limited.request("/exercises/squat", asUser)
    ).headers.get("ETag");

    const statuses = await requestTimes(limited, 120, {
      headers: { ...asUser.headers, "If-None-Match": etag ?? "" },
    });

    expect(statuses.at(-2)).toBe(304);
    expect(statuses.at(-1)).toBe(429);
  });

  it.each([
    ["the Public API", API_SECRET],
    ["the Coach", COACH_SECRET],
    ["the MCP server", MCP_SECRET],
  ])("never limits %s", async (_, secret) => {
    const limiter = vi.fn<RateLimiter["limit"]>(() =>
      Promise.resolve({ allowed: false, retryAfterSeconds: 60 })
    );
    const { limited } = limitedApp({ limit: limiter });

    expect(await requestTimes(limited, 200, bearer(secret))).toEqual(
      new Array(200).fill(200)
    );
    expect(limiter).not.toHaveBeenCalled();
  });

  it("checks the token before counting", async () => {
    const limiter = vi.fn<RateLimiter["limit"]>(() =>
      Promise.resolve({ allowed: true })
    );
    const { limited } = limitedApp({ limit: limiter });

    const response = await limited.request("/exercises/squat");

    expect(response.status).toBe(401);
    expect(limiter).not.toHaveBeenCalled();
  });

  it("serves the request and reports when the limiter throws", async () => {
    const outage = new Error("Upstash is down");
    const { limited, reported } = limitedApp({
      limit: () => Promise.reject(outage),
    });

    const response = await limited.request("/exercises/squat", asUser);

    expect(response.status).toBe(200);
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).cause).toBe(outage);
  });

  it("serves the request and reports when the limiter times out", async () => {
    vi.useFakeTimers();
    const { limited, reported } = limitedApp({
      limit: () => new Promise(() => undefined),
    });

    let settled = false;
    const pending = Promise.resolve(
      limited.request("/exercises/squat", asUser)
    ).finally(() => {
      settled = true;
    });
    // Token verification is async, so the limiter's timer starts some ticks in.
    while (!settled) {
      // biome-ignore lint/performance/noAwaitInLoops: each step lets the request reach its next timer
      await vi.advanceTimersByTimeAsync(100);
    }
    const response = await pending;
    vi.useRealTimers();

    expect(response.status).toBe(200);
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).cause).toEqual(
      new Error("Rate limiter timed out after 1000 ms")
    );
  });
});

describe("rateLimiterFromEnv", () => {
  it("refuses to start in production without Upstash", () => {
    expect(() => rateLimiterFromEnv({ NODE_ENV: "production" })).toThrow(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
    expect(() =>
      rateLimiterFromEnv({
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      })
    ).toThrow();
  });

  it("uses the in-memory limiter outside production without Upstash", async () => {
    const limiter = rateLimiterFromEnv({ NODE_ENV: "development" });

    expect(await limiter.limit("user_alice")).toEqual({ allowed: true });
  });

  it("uses Upstash in production when it's configured", () => {
    expect(() =>
      rateLimiterFromEnv({
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_TOKEN: "token",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      })
    ).not.toThrow();
  });
});
