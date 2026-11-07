import { readFileSync } from "node:fs";

import { appLanguages, equipment, muscleGroups } from "@fitme/core/models";
import { describe, expect, it, vi } from "vitest";

import { serverSecretsFromEnv } from "./auth";
import { LibraryBundle } from "./bundle";
import type { BundleExercise as LibraryExercise } from "./bundle";
import { createApp } from "./create-app";
import type { AppDeps } from "./create-app";
import {
  memoryRateLimiter,
  rateLimiterFromEnv,
  USER_LIMIT,
  USER_REQUESTS_PER_WINDOW,
} from "./rate-limit";
import type { RateLimiter } from "./rate-limit";
import type { ExerciseBatch, ExercisePage } from "./schemas";
import { serveLibrary } from "./served-library";
import { clerkInstance, clerkToken } from "./test/clerk";
import {
  fakeOid,
  inUkrainian,
  libraryCover,
  libraryExercise,
} from "./test/fixtures";

const SUPABASE_URL = "https://project.supabase.co";

/** An invalid request message naming the `language` field. */
const LANGUAGE_PROBLEM = /^language: /u;

/** An invalid request message naming the `muscle_groups` field (or one of its items). */
const MUSCLE_GROUPS_PROBLEM = /^muscle_groups[.:]/u;

/** An invalid request message naming the `equipment` field (or one of its items). */
const EQUIPMENT_PROBLEM = /^equipment[.:]/u;

/** The library hash, a sha256, quoted. */
const LIBRARY_ETAG = /^"[0-9a-f]{64}"$/u;

const ARNOLD_SECRET = "c".repeat(32);
const MCP_SECRET = "m".repeat(64);
const API_SECRET = "a".repeat(48);

/** Each server caller with its secret. */
const SERVER_SECRETS = [
  ["api", API_SECRET],
  ["arnold", ARNOLD_SECRET],
  ["mcp", MCP_SECRET],
] as const;

const production = clerkInstance();
const development = clerkInstance();

const auth: AppDeps["auth"] = {
  clerkJwtKeys: {
    development: development.jwtKey,
    production: production.jwtKey,
  },
  serverSecrets: { api: API_SECRET, arnold: ARNOLD_SECRET, mcp: MCP_SECRET },
};

/** A limiter that never refuses, for tests that aren't about limits. */
const unlimited: RateLimiter = {
  limit: () => Promise.resolve({ allowed: true }),
};

/** The deps every test app shares: no limits, no one identified, errors dropped. */
const base = {
  auth,
  identifyUser: () => {},
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

/** An app serving an empty Library, for adding test routes to. */
const emptyApp = () =>
  createApp({
    ...base,
    library: serveLibrary({ exercises: [] }, SUPABASE_URL),
  });

const currentEtag = async () => {
  const response = await app.request("/exercises/bench-press", asUser);
  const etag = response.headers.get("ETag");

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
  // SAFETY: Valid list requests return ExercisePage; error bodies are only compared as a whole.
  const body = (await response.json()) as ExercisePage;

  return { body, status: response.status };
};

const names = (body: ExercisePage) =>
  body.data.map((exercise) => exercise.name);

const envApp = (env: Record<string, string | undefined>) =>
  callerApp({
    auth: { ...auth, serverSecrets: serverSecretsFromEnv(env) },
  });

describe("auth", () => {
  it("answers a content route without a token with 401", async () => {
    const response = await app.request("/exercises/bench-press");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toStrictEqual(unauthorized);
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
    await expect(response.json()).resolves.toStrictEqual({
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
    await expect(response.json()).resolves.toStrictEqual({
      type: "user",
      userId: "user_bob",
    });
  });

  it.each([
    ["a garbage token", { authorization: "Bearer not-a-jwt" }],
    ["a non-bearer scheme", { authorization: `Basic ${ARNOLD_SECRET}` }],
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
    await expect(response.json()).resolves.toStrictEqual(unauthorized);
  });

  it.each(SERVER_SECRETS)(
    "resolves the %s server caller from its secret",
    async (name, secret) => {
      const response = await callerApp().request("/caller", bearer(secret));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual({
        name,
        type: "server",
      });
    }
  );

  it("accepts nothing with a secret under 32 characters", async () => {
    const short = "s".repeat(31);

    const response = await callerApp({
      auth: {
        ...auth,
        serverSecrets: { api: short, arnold: short, mcp: short },
      },
    }).request("/caller", bearer(short));

    expect(response.status).toBe(401);
  });

  it("accepts nothing with an unset secret", async () => {
    const response = await callerApp({
      auth: { ...auth, serverSecrets: {} },
    }).request("/caller", bearer(ARNOLD_SECRET));

    expect(response.status).toBe(401);
  });

  describe("server secrets from the environment", () => {
    it("reads each caller's secret", async () => {
      const configured = envApp({
        LIBRARY_ARNOLD_SECRET: ARNOLD_SECRET,
        LIBRARY_MCP_SECRET: MCP_SECRET,
        LIBRARY_PUBLIC_API_SECRET: API_SECRET,
      });

      const callers = await Promise.all(
        SERVER_SECRETS.map(async ([, secret]) => {
          const response = await configured.request("/caller", bearer(secret));

          return await response.json();
        })
      );

      expect(callers).toStrictEqual(
        SERVER_SECRETS.map(([name]) => ({ name, type: "server" }))
      );
    });

    it("reads none of the old EXERCISES_* names", async () => {
      const configured = envApp({
        EXERCISES_API_SECRET: API_SECRET,
        EXERCISES_ARNOLD_SECRET: ARNOLD_SECRET,
        EXERCISES_COACH_SECRET: ARNOLD_SECRET,
        EXERCISES_MCP_SECRET: MCP_SECRET,
      });

      const responses = await Promise.all(
        SERVER_SECRETS.map(
          async ([, secret]) =>
            await configured.request("/caller", bearer(secret))
        )
      );

      expect(responses.map((response) => response.status)).toStrictEqual([
        401, 401, 401,
      ]);
    });

    it.each([
      "LIBRARY_ARNOLD_SECRET",
      "LIBRARY_MCP_SECRET",
      "LIBRARY_PUBLIC_API_SECRET",
    ])("accepts nothing with a short %s", async (name) => {
      const response = await envApp({ [name]: "s".repeat(31) }).request(
        "/caller",
        bearer("s".repeat(31))
      );

      expect(response.status).toBe(401);
    });
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

      const statusFor = async (request: ReturnType<typeof bearer>) => {
        const response = await configuredApp.request("/caller", request);

        return response.status;
      };

      const otherSecrets = SERVER_SECRETS.filter(([other]) => other !== name);

      await expect(statusFor(bearer(secret))).resolves.toBe(401);

      const configuredStatuses = await Promise.all(
        (configured ? [configured] : []).map((token) =>
          statusFor(bearer(token))
        )
      );

      expect(configuredStatuses).toStrictEqual(configured ? [401] : []);

      const stillAccepted = await Promise.all(
        [...otherSecrets.map(([, other]) => bearer(other)), asUser].map(
          statusFor
        )
      );

      expect(stillAccepted.every((status) => status === 200)).toBeTruthy();
    }
  );

  it("accepts no Clerk token with no Clerk keys", async () => {
    const response = await callerApp({
      auth: { ...auth, clerkJwtKeys: {} },
    }).request("/caller", asUser);

    expect(response.status).toBe(401);
  });
});

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

describe("error reporting identity", () => {
  it("identifies a User by their Clerk id", async () => {
    const { identified, identifying } = identifyingApp();

    const response = await identifying.request("/caller", asUser);

    expect(response.status).toBe(200);
    expect(identified).toStrictEqual(["user_alice"]);
  });

  it.each(SERVER_SECRETS)(
    "identifies no User for the %s server caller",
    async (_name, secret) => {
      const { identified, identifying } = identifyingApp();

      const response = await identifying.request("/caller", bearer(secret));

      expect(response.status).toBe(200);
      expect(identified).toStrictEqual([]);
    }
  );

  it("identifies no one for a refused request", async () => {
    const { identified, identifying } = identifyingApp();

    const response = await identifying.request("/caller");

    expect(response.status).toBe(401);
    expect(identified).toStrictEqual([]);
  });
});

describe("openAPI spec", () => {
  it("declares bearer auth on every content route, not on /health", () => {
    const spec = app.getOpenAPIDocument({
      info: { title: "test", version: "0" },
      openapi: "3.0.3",
    });

    expect(spec.components?.securitySchemes).toMatchObject({
      bearerAuth: { scheme: "bearer", type: "http" },
    });
    expect(spec.paths["/exercises"]?.get?.security).toStrictEqual([
      { bearerAuth: [] },
    ]);
    expect(spec.paths["/exercises/{slug}"]?.get?.security).toStrictEqual([
      { bearerAuth: [] },
    ]);
    expect(spec.paths["/covers"]?.get?.security).toStrictEqual([
      { bearerAuth: [] },
    ]);
    expect(spec.paths["/health"]?.get?.security).toBeUndefined();
  });
});

describe("gET /exercises", () => {
  it("lists every Exercise alphabetically by name, as summaries", async () => {
    const { body, status } = await list();

    expect(status).toBe(200);
    expect(names(body)).toStrictEqual([
      "Back Squat",
      "Bench Press",
      "Deadlift",
      "Pull-Up",
      "squat (front)",
    ]);
    expect(body.total).toBe(5);
    expect(body.hasMore).toBeFalsy();
    expect(body.data[0]).toStrictEqual({
      // untagged in the bundle, so no Equipment
      equipment: [],
      muscle_groups: ["quadriceps", "glutes"],
      name: "Back Squat",
      slug: "squat",
      thumbnail_url: `https://project.supabase.co/storage/v1/render/image/public/exercise-media/squat/${fakeOid("a")}.png`,
      video_url: `https://project.supabase.co/storage/v1/object/public/exercise-media/squat/${fakeOid("b")}.mp4`,
    });
  });
});

describe("gET /exercises search", () => {
  it("matches the name case-insensitively, anywhere in it", async () => {
    const { body } = await list("?search=SQU");

    expect(names(body)).toStrictEqual(["Back Squat", "squat (front)"]);
    expect(body).toMatchObject({ hasMore: false, total: 2 });
  });

  it("counts every match in total, not just the page", async () => {
    const { body } = await list("?search=squat&limit=1");

    expect(names(body)).toStrictEqual(["Back Squat"]);
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

    const search = async (term: string) => {
      const response = await wildcardApp.request(
        `/exercises?search=${encodeURIComponent(term)}`,
        asUser
      );

      // SAFETY: This fixture app serves ExercisePage for every valid search above.
      const body = (await response.json()) as ExercisePage;

      return names(body);
    };

    await expect(search("%")).resolves.toStrictEqual(["100% Effort"]);
    await expect(search("_")).resolves.toStrictEqual(["Snake_Walk"]);
    await expect(search("e_w")).resolves.toStrictEqual(["Snake_Walk"]);
    await expect(search("b%s")).resolves.toStrictEqual([]);
  });

  it("ignores surrounding whitespace, and lists everything for a blank search", async () => {
    const trimmed = await list("?search=%20press%20");
    const blank = await list("?search=%20%20");

    expect(names(trimmed.body)).toStrictEqual(["Bench Press"]);
    expect(blank.body.total).toBe(5);
  });

  it("answers a search over 100 characters with 400", async () => {
    const { status } = await list(`?search=${"a".repeat(101)}`);

    expect(status).toBe(400);
  });

  it("answers no match with an empty page", async () => {
    const { body } = await list("?search=row");

    expect(body).toStrictEqual({
      data: [],
      hasMore: false,
      total: 0,
    });
  });
});

describe("gET /exercises muscle group filter", () => {
  it("lists only Exercises with that muscle group", async () => {
    const { body } = await list("?muscle_group=quadriceps");

    expect(names(body)).toStrictEqual(["Back Squat", "squat (front)"]);
    expect(body).toMatchObject({ hasMore: false, total: 2 });
  });

  it("combines with search", async () => {
    const { body } = await list("?muscle_group=quadriceps&search=back");

    expect(names(body)).toStrictEqual(["Back Squat"]);
  });

  it("answers a known muscle group no Exercise has with an empty page", async () => {
    const { body } = await list("?muscle_group=calves");

    expect(body).toStrictEqual({
      data: [],
      hasMore: false,
      total: 0,
    });
  });

  it("answers an unknown muscle group with 400 in the error shape", async () => {
    const { body, status } = await list("?muscle_group=neck");

    expect(status).toBe(400);
    expect(body).toStrictEqual({
      error: { code: "invalid_request", message: expect.any(String) },
    });
  });

  it("is an enum of every muscle group in the OpenAPI definition", () => {
    const document = listApp.getOpenAPIDocument({
      info: { title: "Library API", version: "1" },
      openapi: "3.1.0",
    });

    const parameter = document.paths["/exercises"]?.get?.parameters?.find(
      (p) => "name" in p && p.name === "muscle_group"
    );

    expect(parameter).toMatchObject({
      in: "query",
      schema: { $ref: "#/components/schemas/MuscleGroup" },
    });
    expect(document.components?.schemas?.MuscleGroup).toStrictEqual({
      enum: [...muscleGroups],
      type: "string",
    });
  });
});

describe("gET /exercises several muscle groups", () => {
  it("lists only Exercises with that muscle group, given one", async () => {
    const { body } = await list("?muscle_groups=quadriceps");

    expect(names(body)).toStrictEqual(["Back Squat", "squat (front)"]);
    expect(body).toMatchObject({ hasMore: false, total: 2 });
  });

  it("lists Exercises with any of them, alphabetically, each once", async () => {
    const { body } = await list("?muscle_groups=quadriceps,chest,triceps");

    expect(names(body)).toStrictEqual([
      "Back Squat",
      "Bench Press",
      "squat (front)",
    ]);
    expect(body).toMatchObject({ hasMore: false, total: 3 });
  });

  it("counts a repeated muscle group once", async () => {
    const { body } = await list("?muscle_groups=quadriceps,quadriceps");

    expect(names(body)).toStrictEqual(["Back Squat", "squat (front)"]);
    expect(body.total).toBe(2);
  });

  it("combines with search", async () => {
    const { body } = await list("?muscle_groups=chest,quadriceps&search=back");

    expect(names(body)).toStrictEqual(["Back Squat"]);
    expect(body.total).toBe(1);
  });

  it("pages with limit and offset, with total and hasMore across pages", async () => {
    const first = await list("?muscle_groups=chest,quadriceps&limit=2");

    const second = await list(
      "?muscle_groups=chest,quadriceps&limit=2&offset=2"
    );

    expect(first.body).toMatchObject({ hasMore: true, total: 3 });
    expect(names(first.body)).toStrictEqual(["Back Squat", "Bench Press"]);
    expect(second.body).toMatchObject({ hasMore: false, total: 3 });
    expect(names(second.body)).toStrictEqual(["squat (front)"]);
  });

  it("answers a known muscle group no Exercise has with an empty page", async () => {
    const { body } = await list("?muscle_groups=calves,forearms");

    expect(body).toStrictEqual({
      data: [],
      hasMore: false,
      total: 0,
    });
  });

  it.each([
    ["an unknown muscle group", "?muscle_groups=chest,neck"],
    ["an empty item", "?muscle_groups=chest,,triceps"],
    ["a trailing comma", "?muscle_groups=chest,"],
    ["an empty value", "?muscle_groups="],
    ["muscle_group as well", "?muscle_group=chest&muscle_groups=triceps"],
  ])("answers %s with 400 naming the field", async (_, query) => {
    const { body, status } = await list(query);

    expect(status).toBe(400);
    expect(body).toStrictEqual({
      error: {
        code: "invalid_request",
        message: expect.stringMatching(MUSCLE_GROUPS_PROBLEM),
      },
    });
  });

  it("leaves muscle_group on its own as it was", async () => {
    const { body } = await list("?muscle_group=chest");

    expect(names(body)).toStrictEqual(["Bench Press"]);
    expect(body.total).toBe(1);
  });

  it("is an optional comma-separated string in the OpenAPI definition", () => {
    const document = listApp.getOpenAPIDocument({
      info: { title: "Library API", version: "1" },
      openapi: "3.1.0",
    });

    const parameter = document.paths["/exercises"]?.get?.parameters?.find(
      (p) => "name" in p && p.name === "muscle_groups"
    );

    expect(parameter).toMatchObject({
      in: "query",
      required: false,
      schema: { type: "string" },
    });
  });
});

/** A Library whose Exercises are tagged with Equipment, one left untagged. */
const taggedApp = createApp({
  ...base,
  library: serveLibrary(
    {
      // sorted by Exercise slug, as the bundle lists them
      exercises: [
        libraryExercise(
          "bench-press",
          "Bench Press",
          ["chest", "triceps"],
          ["barbell", "bench"]
        ),
        libraryExercise(
          "deadlift",
          "Deadlift",
          ["back", "hamstrings"],
          ["barbell"]
        ),
        libraryExercise(
          "goblet-squat",
          "Goblet Squat",
          ["quadriceps"],
          ["dumbbell"]
        ),
        libraryExercise("pull-up", "Pull-Up", ["lats"], ["pull_up_bar"]),
        libraryExercise("sit-up", "Sit-Up", ["abs"]),
      ],
    },
    SUPABASE_URL
  ),
});

const tagged = async (query = "") => {
  const response = await taggedApp.request(`/exercises${query}`, asUser);
  // SAFETY: Valid list requests return ExercisePage; error bodies are only compared as a whole.
  const body = (await response.json()) as ExercisePage;

  return { body, status: response.status };
};

describe("gET /exercises Equipment filter", () => {
  it("lists only Exercises with that Equipment", async () => {
    const { body } = await tagged("?equipment=barbell");

    expect(names(body)).toStrictEqual(["Bench Press", "Deadlift"]);
    expect(body).toMatchObject({ hasMore: false, total: 2 });
  });

  it("lists Exercises needing any of them, alphabetically, each once", async () => {
    const { body } = await tagged("?equipment=dumbbell,bench,pull_up_bar");

    expect(names(body)).toStrictEqual([
      "Bench Press",
      "Goblet Squat",
      "Pull-Up",
    ]);
    expect(body).toMatchObject({ hasMore: false, total: 3 });
  });

  it("counts a repeated Equipment once", async () => {
    const { body } = await tagged("?equipment=barbell,barbell");

    expect(names(body)).toStrictEqual(["Bench Press", "Deadlift"]);
    expect(body.total).toBe(2);
  });

  it("combines with several muscle groups", async () => {
    const { body } = await tagged("?equipment=barbell&muscle_groups=chest,abs");

    expect(names(body)).toStrictEqual(["Bench Press"]);
    expect(body.total).toBe(1);
  });

  it("combines with one muscle group", async () => {
    const { body } = await tagged("?equipment=barbell&muscle_group=back");

    expect(names(body)).toStrictEqual(["Deadlift"]);
    expect(body.total).toBe(1);
  });

  it("combines with search", async () => {
    const { body } = await tagged("?equipment=barbell,dumbbell&search=squat");

    expect(names(body)).toStrictEqual(["Goblet Squat"]);
    expect(body.total).toBe(1);
  });

  it("leaves search matching names only, never Equipment", async () => {
    const { body } = await tagged("?search=barbell");

    expect(body).toMatchObject({
      data: [],
      total: 0,
    });
  });

  it("pages with limit and offset, with total and hasMore across pages", async () => {
    const first = await tagged("?equipment=barbell,dumbbell&limit=2");
    const second = await tagged("?equipment=barbell,dumbbell&limit=2&offset=2");

    expect(first.body).toMatchObject({ hasMore: true, total: 3 });
    expect(names(first.body)).toStrictEqual(["Bench Press", "Deadlift"]);
    expect(second.body).toMatchObject({ hasMore: false, total: 3 });
    expect(names(second.body)).toStrictEqual(["Goblet Squat"]);
  });

  it("never matches an Exercise the Library hasn't tagged", async () => {
    const { body } = await tagged(`?equipment=${equipment.join(",")}`);

    expect(names(body)).toStrictEqual([
      "Bench Press",
      "Deadlift",
      "Goblet Squat",
      "Pull-Up",
    ]);
    expect(body.total).toBe(4);
  });

  it("answers a known Equipment no Exercise needs with an empty page", async () => {
    const { body } = await tagged("?equipment=cable,landmine");

    expect(body).toStrictEqual({
      data: [],
      hasMore: false,
      total: 0,
    });
  });

  it.each(appLanguages)("filters in %s", async (language) => {
    const { body } = await tagged(
      `?equipment=pull_up_bar&language=${language}`
    );

    expect(names(body)).toStrictEqual(["Pull-Up"]);
    expect(body.total).toBe(1);
  });

  it.each([
    ["an unknown Equipment", "?equipment=barbell,kettlebell"],
    ["an empty item", "?equipment=barbell,,bench"],
    ["a trailing comma", "?equipment=barbell,"],
    ["an empty value", "?equipment="],
  ])("answers %s with 400 naming the field", async (_, query) => {
    const { body, status } = await tagged(query);

    expect(status).toBe(400);
    expect(body).toStrictEqual({
      error: {
        code: "invalid_request",
        message: expect.stringMatching(EQUIPMENT_PROBLEM),
      },
    });
  });

  it("is an optional comma-separated string in the OpenAPI definition", () => {
    const document = taggedApp.getOpenAPIDocument({
      info: { title: "Library API", version: "1" },
      openapi: "3.1.0",
    });

    const parameter = document.paths["/exercises"]?.get?.parameters?.find(
      (p) => "name" in p && p.name === "equipment"
    );

    expect(parameter).toMatchObject({
      in: "query",
      required: false,
      schema: { type: "string" },
    });
  });
});

describe("gET /exercises pagination", () => {
  it("pages with limit and offset, with total and hasMore across pages", async () => {
    const first = await list("?limit=2");
    const middle = await list("?limit=2&offset=2");
    const last = await list("?limit=2&offset=4");

    expect(names(first.body)).toStrictEqual(["Back Squat", "Bench Press"]);
    expect(first.body).toMatchObject({ hasMore: true, total: 5 });
    expect(names(middle.body)).toStrictEqual(["Deadlift", "Pull-Up"]);
    expect(middle.body).toMatchObject({ hasMore: true, total: 5 });
    expect({
      names: names(last.body),
      hasMore: last.body.hasMore,
      total: last.body.total,
    }).toStrictEqual({ names: ["squat (front)"], hasMore: false, total: 5 });
  });

  it("answers an offset past the end with an empty page", async () => {
    const { body, status } = await list("?offset=10");

    expect(status).toBe(200);
    expect(body).toStrictEqual({ data: [], hasMore: false, total: 5 });
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

    const response = await big.request("/exercises", asUser);
    // SAFETY: The fixture app returns ExercisePage for this valid list request.
    const body = (await response.json()) as ExercisePage;

    expect(body.data).toHaveLength(20);
    expect(body).toMatchObject({ hasMore: true, total: 21 });
  });

  it.each(["?limit=0", "?limit=51", "?limit=2.5", "?limit=abc", "?offset=-1"])(
    "answers %s with 400 in the error shape",
    async (query) => {
      const { body, status } = await list(query);

      expect(status).toBe(400);
      expect(body).toStrictEqual({
        error: { code: "invalid_request", message: expect.any(String) },
      });
    }
  );

  it("accepts the limit bounds", async () => {
    const minimum = await list("?limit=1");
    const maximum = await list("?limit=50");

    expect(minimum.body.data).toHaveLength(1);
    expect(maximum.status).toBe(200);
  });
});

const batch = async (slugs: string, rest = "") => {
  const response = await listApp.request(
    `/exercises?slugs=${slugs}${rest}`,
    asUser
  );

  // SAFETY: Valid slugs requests return ExerciseBatch; error bodies are only compared as a whole.
  const body = (await response.json()) as ExerciseBatch;

  return { body, status: response.status };
};

const slugList = (count: number) =>
  Array.from({ length: count }, (_, i) => `exercise-${i}`).join(",");

describe("gET /exercises?slugs (batch lookup)", () => {
  it("answers known Exercise slugs in request order, as summaries, and lists unknown ones as missing", async () => {
    const { body, status } = await batch("squat,nope,bench-press,gone");

    expect(status).toBe(200);
    expect(body.data.map((exercise) => exercise.slug)).toStrictEqual([
      "squat",
      "bench-press",
    ]);
    expect(body.missing).toStrictEqual(["nope", "gone"]);
    expect(body.data[0]).toStrictEqual({
      // untagged in the bundle, so no Equipment
      equipment: [],
      muscle_groups: ["quadriceps", "glutes"],
      name: "Back Squat",
      slug: "squat",
      thumbnail_url: `https://project.supabase.co/storage/v1/render/image/public/exercise-media/squat/${fakeOid("a")}.png`,
      video_url: `https://project.supabase.co/storage/v1/object/public/exercise-media/squat/${fakeOid("b")}.mp4`,
    });
  });

  it("answers a repeated Exercise slug once, where it first appears", async () => {
    const { body } = await batch("squat,nope,deadlift,squat,nope");

    expect(body.data.map((exercise) => exercise.slug)).toStrictEqual([
      "squat",
      "deadlift",
    ]);
    expect(body.missing).toStrictEqual(["nope"]);
  });

  it("looks up at most 40 Exercise slugs", async () => {
    const { body } = await batch(slugList(40));

    expect(body.missing).toHaveLength(40);
  });

  it.each([
    ["41 Exercise slugs", slugList(41)],
    ["41 Exercise slugs with a repeat", `${slugList(40)},exercise-0`],
    ["an empty slugs", ""],
    ["an empty Exercise slug in the list", "squat,,deadlift"],
  ])("answers %s with 400 in the error shape", async (_, slugs) => {
    const { body, status } = await batch(slugs);

    expect(status).toBe(400);
    expect(body).toStrictEqual({
      error: { code: "invalid_request", message: expect.any(String) },
    });
  });

  it.each([
    "&search=squat",
    "&search=",
    "&muscle_group=quadriceps",
    "&muscle_groups=quadriceps,chest",
    "&equipment=barbell",
    "&limit=20",
    "&offset=0",
  ])(
    "answers slugs combined with %s with 400 in the error shape",
    async (rest) => {
      const { body, status } = await batch("squat", rest);

      expect(status).toBe(400);
      expect(body).toStrictEqual({
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
      info: { title: "Library API", version: "1" },
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
    ).toStrictEqual({
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

describe("gET /exercises/:slug", () => {
  it("answers the full Exercise", async () => {
    const response = await app.request("/exercises/bench-press", asUser);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      description: "Bench Press is a compound pushing movement.\n",
      // untagged in the bundle, so no Equipment
      equipment: [],
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
    await expect(response.json()).resolves.toStrictEqual({
      error: { code: "not_found", message: "Exercise not found" },
    });
  });
});

describe("exercise Equipment", () => {
  const equippedApp = createApp({
    ...base,
    library: serveLibrary(
      {
        exercises: [
          // written the other way round, so the order can only come from core
          inUkrainian(
            libraryExercise(
              "bench-press",
              "Bench Press",
              ["chest", "triceps"],
              ["bench", "barbell"]
            ),
            "Жим лежачи"
          ),
          libraryExercise("pull-up", "Pull-Up", ["lats"], ["pull_up_bar"]),
          libraryExercise("sit-up", "Sit-Up", ["abs"]),
        ],
      },
      SUPABASE_URL
    ),
  });

  const equipmentBySlug = async (path: string) => {
    const response = await equippedApp.request(path, asUser);
    // SAFETY: Callers request a valid list or batch, both of which contain Exercise summaries.
    const body = (await response.json()) as ExercisePage | ExerciseBatch;

    return Object.fromEntries(
      body.data.map((exercise) => [exercise.slug, exercise.equipment])
    );
  };

  it("lists it in core's order, and none for an untagged Exercise", async () => {
    await expect(equipmentBySlug("/exercises")).resolves.toStrictEqual({
      "bench-press": ["barbell", "bench"],
      "pull-up": ["pull_up_bar"],
      "sit-up": [],
    });
  });

  it("answers it on a batch lookup", async () => {
    await expect(
      equipmentBySlug("/exercises?slugs=sit-up,bench-press")
    ).resolves.toStrictEqual({
      "bench-press": ["barbell", "bench"],
      "sit-up": [],
    });
  });

  it.each(appLanguages)(
    "answers it on one Exercise in %s",
    async (language) => {
      const response = await equippedApp.request(
        `/exercises/bench-press?language=${language}`,
        asUser
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        equipment: ["barbell", "bench"],
        name: language === "uk" ? "Жим лежачи" : "Bench Press",
      });
    }
  );

  it.each(appLanguages)("lists it in %s", async (language) => {
    await expect(
      equipmentBySlug(`/exercises?language=${language}`)
    ).resolves.toStrictEqual({
      "bench-press": ["barbell", "bench"],
      "pull-up": ["pull_up_bar"],
      "sit-up": [],
    });
  });

  it("is an enum of every Equipment in the OpenAPI definition", () => {
    const document = equippedApp.getOpenAPIDocument({
      info: { title: "Library API", version: "1" },
      openapi: "3.1.0",
    });

    expect(document.components?.schemas?.Equipment).toStrictEqual({
      enum: [...equipment],
      type: "string",
    });
    expect(document.components?.schemas?.ExerciseSummary).toMatchObject({
      properties: {
        equipment: {
          items: { $ref: "#/components/schemas/Equipment" },
          type: "array",
        },
      },
      required: expect.arrayContaining(["equipment"]),
    });
  });
});

describe("a Library with Ukrainian content, without a language", () => {
  // the same Exercises as `app`'s, one of them translated
  const translatedApp = createApp({
    ...base,
    library: serveLibrary(
      {
        exercises: [
          inUkrainian(
            libraryExercise("bench-press", "Bench Press"),
            "Жим лежачи"
          ),
          libraryExercise("squat", "Squat"),
        ],
      },
      SUPABASE_URL
    ),
  });

  it.each([
    "/exercises/bench-press",
    "/exercises",
    "/exercises?search=bench",
    "/exercises?slugs=bench-press,squat",
  ])("answers %s in English, byte for byte as without it", async (path) => {
    const translated = await translatedApp.request(path, asUser);
    const english = await app.request(path, asUser);

    expect(translated.status).toBe(200);
    await expect(translated.text()).resolves.toBe(await english.text());
  });

  it.each([
    "/exercises/bench-press",
    "/exercises?search=bench",
    "/exercises?slugs=bench-press,squat",
  ])("answers %s with language=en exactly as without it", async (path) => {
    const separator = path.includes("?") ? "&" : "?";

    const english = await translatedApp.request(
      `${path}${separator}language=en`,
      asUser
    );

    const unasked = await translatedApp.request(path, asUser);

    expect(english.status).toBe(200);
    await expect(english.text()).resolves.toBe(await unasked.text());
  });

  it("doesn't find an Exercise by its Ukrainian name", async () => {
    const response = await translatedApp.request(
      `/exercises?search=${encodeURIComponent("жим")}`,
      asUser
    );

    await expect(response.json()).resolves.toStrictEqual({
      data: [],
      hasMore: false,
      total: 0,
    });
  });
});

describe("language=uk", () => {
  // the committed fixture: example-press and example-row have made-up `uk`
  // content, example-squat has none
  const fixtureApp = createApp({
    ...base,
    library: serveLibrary(
      LibraryBundle.parse(
        JSON.parse(
          readFileSync(
            new URL("../fixtures/library.json", import.meta.url),
            "utf-8"
          )
        )
      ),
      SUPABASE_URL
    ),
  });

  const request = async (path: string, init = asUser) => {
    const response = await fixtureApp.request(path, init);

    return { body: await response.json(), response };
  };

  it("lists Exercises in Ukrainian, in Ukrainian order, an untranslated one in English", async () => {
    const { body } = await request("/exercises?language=uk");

    expect(names(body)).toStrictEqual([
      "Приклад жиму",
      "Приклад тяги",
      "Example Squat",
    ]);
  });

  it("looks up a batch in Ukrainian, an untranslated one in English", async () => {
    const { body } = await request(
      "/exercises?slugs=example-squat,example-press,nope&language=uk"
    );

    expect(body).toStrictEqual({
      data: [
        expect.objectContaining({
          name: "Example Squat",
          slug: "example-squat",
        }),
        expect.objectContaining({
          name: "Приклад жиму",
          slug: "example-press",
        }),
      ],
      missing: ["nope"],
    });
  });

  it("answers one Exercise wholly in Ukrainian", async () => {
    const { body } = await request("/exercises/example-press?language=uk");
    const { body: english } = await request("/exercises/example-press");

    expect(body).toStrictEqual({
      ...english,
      description:
        "Приклад жиму — вигадана вправа для завантажувача Бібліотеки. Це не справжній вміст.\n",
      instructions:
        "1. Це текст-заповнювач.\n2. Замініть вправи з фікстури справжнім набором.\n",
      name: "Приклад жиму",
    });
  });

  it("answers an Exercise without a Ukrainian translation wholly in English", async () => {
    const ukrainian = await fixtureApp.request(
      "/exercises/example-squat?language=uk",
      asUser
    );

    const english = await fixtureApp.request(
      "/exercises/example-squat",
      asUser
    );

    expect(ukrainian.status).toBe(200);
    await expect(ukrainian.text()).resolves.toBe(await english.text());
  });

  it.each([
    ["its Ukrainian name", "жиму", ["Приклад жиму"]],
    ["its English name", "press", ["Приклад жиму"]],
    [
      "either name, case-insensitively",
      "ПРИКЛАД",
      ["Приклад жиму", "Приклад тяги"],
    ],
    ["an untranslated Exercise's English name", " squat ", ["Example Squat"]],
  ])("finds an Exercise by %s", async (_, search, found) => {
    const { body } = await request(
      `/exercises?language=uk&search=${encodeURIComponent(search)}`
    );

    expect(names(body)).toStrictEqual(found);
    expect(body.total).toBe(found.length);
  });

  it("combines with the muscle group filter and paging", async () => {
    const { body } = await request(
      "/exercises?language=uk&muscle_group=back&limit=1&offset=0"
    );

    expect(body).toStrictEqual({
      data: [expect.objectContaining({ name: "Приклад тяги" })],
      hasMore: false,
      total: 1,
    });
  });

  it("combines with several muscle groups and paging", async () => {
    const first = await request(
      "/exercises?language=uk&muscle_groups=back,chest&limit=1"
    );

    const second = await request(
      "/exercises?language=uk&muscle_groups=back,chest&limit=1&offset=1"
    );

    expect(first.body).toStrictEqual({
      data: [expect.objectContaining({ name: "Приклад жиму" })],
      hasMore: true,
      total: 2,
    });
    expect(second.body).toStrictEqual({
      data: [expect.objectContaining({ name: "Приклад тяги" })],
      hasMore: false,
      total: 2,
    });
  });

  it("sorts with Ukrainian collation, not by code point", async () => {
    const ukrainianApp = createApp({
      ...base,
      library: serveLibrary(
        {
          exercises: [
            inUkrainian(libraryExercise("frost", "Frost"), "Іній"),
            inUkrainian(libraryExercise("delta", "Delta"), "Дельта"),
            inUkrainian(libraryExercise("porch", "Porch"), "Ґанок"),
          ],
        },
        SUPABASE_URL
      ),
    });

    const response = await ukrainianApp.request(
      "/exercises?language=uk",
      asUser
    );

    // by code point: І (U+0406), Д (U+0414), Ґ (U+0490)
    // SAFETY: The fixture app returns ExercisePage for this valid Ukrainian list request.
    expect(names((await response.json()) as ExercisePage)).toStrictEqual([
      "Ґанок",
      "Дельта",
      "Іній",
    ]);
  });

  it.each([
    "/exercises?language=ru",
    "/exercises?language=",
    "/exercises?slugs=example-press&language=ru",
    "/exercises/example-press?language=ru",
    "/exercises/example-press?language=",
  ])("answers %s with 400 naming the field", async (path) => {
    const { body, response } = await request(path);

    expect(response.status).toBe(400);
    expect(body).toStrictEqual({
      error: {
        code: "invalid_request",
        message: expect.stringMatching(LANGUAGE_PROBLEM),
      },
    });
  });

  it.each([
    "/exercises?language=uk",
    "/exercises?slugs=example-press&language=uk",
    "/exercises/example-press?language=uk",
  ])("answers %s with 304 when If-None-Match holds its ETag", async (path) => {
    const { response } = await request(path);
    const etag = response.headers.get("ETag") ?? "";

    const revalidated = await fixtureApp.request(path, {
      headers: { ...asUser.headers, "If-None-Match": etag },
    });

    expect(etag).toMatch(LIBRARY_ETAG);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(revalidated.status).toBe(304);
    await expect(revalidated.text()).resolves.toBe("");
  });

  it.each(appLanguages)(
    "accepts %s on every Exercise route, falling back to English without translated content",
    async (language) => {
      await Promise.all(
        [
          `/exercises?language=${language}`,
          `/exercises?slugs=example-squat&language=${language}`,
          `/exercises/example-squat?language=${language}`,
        ].map(async (route) => {
          const { response, body } = await request(route);
          expect(response.status).toBe(200);
          expect(JSON.stringify(body)).toContain("Example Squat");
        })
      );
    }
  );

  it("is an optional enum of the App languages on both routes in the OpenAPI definition", () => {
    const document = fixtureApp.getOpenAPIDocument({
      info: { title: "Library API", version: "1" },
      openapi: "3.1.0",
    });

    for (const path of ["/exercises", "/exercises/{slug}"]) {
      expect(
        document.paths[path]?.get?.parameters?.find(
          (p) => "name" in p && p.name === "language"
        )
      ).toMatchObject({
        in: "query",
        required: false,
        schema: { $ref: "#/components/schemas/Language" },
      });
    }

    expect(document.components?.schemas?.Language).toStrictEqual({
      enum: [...appLanguages],
      type: "string",
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
    await expect(response.text()).resolves.toBe("");
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
    await expect(response.json()).resolves.toMatchObject({ slug: "squat" });
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

    expect(responses.map((response) => response.status)).toStrictEqual([
      404, 404, 500,
    ]);

    expect(
      responses.map((response) => ({
        etag: response.headers.get("ETag"),
        cacheControl: response.headers.get("Cache-Control"),
      }))
    ).toStrictEqual(
      Array.from({ length: responses.length }, () => ({
        etag: null,
        cacheControl: null,
      }))
    );
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
      "Equipment",
      (exercise: LibraryExercise) => ({
        ...exercise,
        equipment: ["barbell" as const],
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

describe("cORS", () => {
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

    expect(responses.map((response) => response.status)).toStrictEqual([
      200, 401,
    ]);

    expect(
      responses.map((response) =>
        response.headers.get("Access-Control-Allow-Origin")
      )
    ).toStrictEqual(["*", "*"]);
  });
});

describe("gET /health", () => {
  it("is public", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ ok: true });
  });
});

describe("errors", () => {
  it("answers an unknown route with a JSON 404", async () => {
    const response = await app.request("/nope", asUser);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toStrictEqual({
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
    await expect(response.json()).resolves.toStrictEqual({
      error: { code: "internal_error", message: "Internal server error" },
    });
    expect(reported).toStrictEqual([boom]);
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
  init: RequestInit = asUser,
  route = "/exercises/squat"
): Promise<number[]> => {
  if (times <= 0) {
    return [];
  }

  const response = await target.request(route, init);
  const rest = await requestTimes(target, times - 1, init, route);

  return [response.status, ...rest];
};

/** A small limit, so the window is tested with a handful of requests. */
const TEST_LIMIT = 3;

/** An app limited to `TEST_LIMIT` requests a minute, on a clock the test moves. */
const smallLimitApp = () => {
  const clock = fakeClock();

  const { limited } = limitedApp(
    memoryRateLimiter({ limit: TEST_LIMIT, now: clock.now })
  );

  return { clock, limited };
};

describe("rate limiting", () => {
  it("limits each User to 120 requests a minute by default", async () => {
    const clock = fakeClock();
    const limiter = memoryRateLimiter({ now: clock.now });
    const { limited } = limitedApp(limiter);

    await Promise.all(
      Array.from({ length: USER_REQUESTS_PER_WINDOW }, () =>
        limiter.limit("user_alice")
      )
    );

    const response = await limited.request("/exercises/squat", asUser);

    expect(USER_LIMIT).toStrictEqual({
      limit: 120,
      prefix: "library:user",
      windowMs: MINUTE_MS,
    });
    expect(response.status).toBe(429);
  });

  it("answers a User's request past the limit within a minute with 429 and Retry-After", async () => {
    const { clock, limited } = smallLimitApp();

    const statuses = await requestTimes(limited, TEST_LIMIT);
    clock.advance(45_000);
    const response = await limited.request("/exercises/squat", asUser);

    expect(statuses).toStrictEqual(
      Array.from({ length: TEST_LIMIT }, () => 200)
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(response.headers.get("ETag")).toBeNull();
    await expect(response.json()).resolves.toStrictEqual({
      error: {
        code: "rate_limited",
        message:
          "Too many requests, retry after the Retry-After header's seconds",
      },
    });
  });

  it("resets the window after a minute", async () => {
    const { clock, limited } = smallLimitApp();

    await expect(requestTimes(limited, TEST_LIMIT + 1)).resolves.toStrictEqual([
      ...Array.from({ length: TEST_LIMIT }, () => 200),
      429,
    ]);
    clock.advance(MINUTE_MS);

    await expect(requestTimes(limited, TEST_LIMIT + 1)).resolves.toStrictEqual([
      ...Array.from({ length: TEST_LIMIT }, () => 200),
      429,
    ]);
  });

  it("counts each User separately", async () => {
    const { limited } = smallLimitApp();

    await requestTimes(limited, TEST_LIMIT + 1);

    const response = await limited.request(
      "/exercises/squat",
      bearer(clerkToken(production.privateKey, { sub: "user_bob" }))
    );

    expect(response.status).toBe(200);
  });

  it("counts a 304 too", async () => {
    const { limited } = smallLimitApp();

    const response = await limited.request("/exercises/squat", asUser);
    const etag = response.headers.get("ETag");

    const statuses = await requestTimes(limited, TEST_LIMIT, {
      headers: { ...asUser.headers, "If-None-Match": etag ?? "" },
    });

    expect(statuses).toStrictEqual([
      ...Array.from({ length: TEST_LIMIT - 1 }, () => 304),
      429,
    ]);
  });

  it.each([
    ["the Public API", API_SECRET],
    ["Arnold", ARNOLD_SECRET],
    ["the MCP server", MCP_SECRET],
  ])("never limits %s", async (_, secret) => {
    const limiter = vi.fn<RateLimiter["limit"]>(() =>
      Promise.resolve({ allowed: false, retryAfterSeconds: 60 })
    );

    const { limited } = limitedApp({ limit: limiter });

    // More than any limit a test sets, all served.
    const times = TEST_LIMIT + 2;
    await expect(
      requestTimes(limited, times, bearer(secret))
    ).resolves.toStrictEqual(Array.from({ length: times }, () => 200));
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
    expect(reported[0]).toHaveProperty("cause", outage);
  });

  it("serves the request and reports when the limiter times out", async () => {
    vi.useFakeTimers();

    const { limited, reported } = limitedApp({
      limit: () => Promise.race([]),
    });

    let settled = false;

    const pending = Promise.resolve(
      limited.request("/exercises/squat", asUser)
    ).finally(() => {
      settled = true;
    });

    // Token verification is async, so keep advancing until the request finishes.
    await vi.waitUntil(() => settled, { interval: 100, timeout: 10_000 });

    const response = await pending;
    vi.useRealTimers();

    expect(response.status).toBe(200);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toHaveProperty(
      "cause",
      new Error("Rate limiter timed out after 1000 ms")
    );
  });
});

describe("rate limiter environment configuration", () => {
  it("refuses to start in production without Upstash", () => {
    expect(() => rateLimiterFromEnv({ NODE_ENV: "production" })).toThrow(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
    expect(() =>
      rateLimiterFromEnv({
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      })
    ).toThrow(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production"
    );
  });

  it("uses the in-memory limiter outside production without Upstash", async () => {
    const limiter = rateLimiterFromEnv({ NODE_ENV: "development" });

    await expect(limiter.limit("user_alice")).resolves.toStrictEqual({
      allowed: true,
    });
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

const CHEST_COVER = "3f2b8a4e-6c1d-4e5f-9a7b-1c2d3e4f5a6b";
const LEGS_COVER = "c6e5d4b3-2a1f-4e8d-9c7b-3f4a5b6c7d8e";

/** An app serving two Exercises and two Covers, limited by `rateLimiter`. */
const coversApp = (rateLimiter: RateLimiter = unlimited) =>
  createApp({
    ...base,
    library: serveLibrary(
      {
        covers: [
          libraryCover(LEGS_COVER, ["quadriceps", "glutes"]),
          libraryCover(CHEST_COVER, ["chest"]),
        ],
        exercises: [
          libraryExercise("bench-press", "Bench Press"),
          libraryExercise("squat", "Squat"),
        ],
      },
      SUPABASE_URL
    ),
    rateLimiter,
  });

const etagOf = async (covers: Parameters<typeof libraryCover>[1]) => {
  const response = await createApp({
    ...base,
    library: serveLibrary(
      { covers: [libraryCover(CHEST_COVER, covers)], exercises: [] },
      SUPABASE_URL
    ),
  }).request("/covers", asUser);

  return response.headers.get("ETag");
};

describe("gET /covers", () => {
  it("answers every Cover in bundle order, its image on the render endpoint", async () => {
    const response = await coversApp().request("/covers", asUser);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: [
        {
          id: LEGS_COVER,
          image_url: `${SUPABASE_URL}/storage/v1/render/image/public/exercise-media/covers/${LEGS_COVER}/${fakeOid("c")}.jpg`,
          muscle_groups: ["quadriceps", "glutes"],
        },
        {
          id: CHEST_COVER,
          image_url: `${SUPABASE_URL}/storage/v1/render/image/public/exercise-media/covers/${CHEST_COVER}/${fakeOid("c")}.jpg`,
          muscle_groups: ["chest"],
        },
      ],
    });
  });

  it("serves any id the bundle accepts, not only RFC uuids", async () => {
    const id = "12345678-1234-1234-1234-123456789abc";

    const served = createApp({
      ...base,
      library: serveLibrary(
        { covers: [libraryCover(id)], exercises: [] },
        SUPABASE_URL
      ),
    });

    const response = await served.request("/covers", asUser);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [{ id }] });
  });

  it("answers an empty list for a Library without Covers", async () => {
    const response = await app.request("/covers", asUser);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ data: [] });
  });

  it("answers the same whatever language is asked", async () => {
    const english = await coversApp().request("/covers", asUser);
    const ukrainian = await coversApp().request("/covers?language=uk", asUser);

    expect(ukrainian.status).toBe(200);
    await expect(ukrainian.json()).resolves.toStrictEqual(await english.json());
  });

  it("answers without a token with 401", async () => {
    const response = await coversApp().request("/covers");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toStrictEqual(unauthorized);
  });

  it.each(SERVER_SECRETS)("serves the %s server caller", async (_, secret) => {
    const response = await coversApp().request("/covers", bearer(secret));

    expect(response.status).toBe(200);
  });

  it("counts a User's requests, answering 429 past the limit", async () => {
    const clock = fakeClock();

    const limited = coversApp(
      memoryRateLimiter({ limit: TEST_LIMIT, now: clock.now })
    );

    const statuses = await requestTimes(
      limited,
      TEST_LIMIT + 1,
      asUser,
      "/covers"
    );

    expect(statuses).toStrictEqual([
      ...Array.from({ length: TEST_LIMIT }, () => 200),
      429,
    ]);
  });

  it("lets devices cache it for an hour, tagged with the library hash /exercises carries", async () => {
    const served = coversApp();
    const response = await served.request("/covers", asUser);
    const exercise = await served.request("/exercises/squat", asUser);

    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(response.headers.get("ETag")).toMatch(LIBRARY_ETAG);
    expect(response.headers.get("ETag")).toBe(exercise.headers.get("ETag"));
  });

  it("answers 304 with no body when If-None-Match holds the current ETag", async () => {
    const served = coversApp();
    const initial = await served.request("/covers", asUser);
    const etag = initial.headers.get("ETag");

    const response = await served.request("/covers", {
      headers: { ...asUser.headers, "If-None-Match": etag ?? "" },
    });

    expect(response.status).toBe(304);
    await expect(response.text()).resolves.toBe("");
    expect(response.headers.get("ETag")).toBe(etag);
  });

  it("answers normally when If-None-Match holds another ETag", async () => {
    const response = await coversApp().request("/covers", {
      headers: { ...asUser.headers, "If-None-Match": `"${"0".repeat(64)}"` },
    });

    expect(response.status).toBe(200);
  });

  it("changes the ETag when a Cover changes", async () => {
    await expect(etagOf(["chest"])).resolves.not.toBe(await etagOf(["back"]));
  });
});
