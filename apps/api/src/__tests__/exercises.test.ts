import { memoryRateLimiter } from "@fitme/rate-limit";
import { describe, expect, it } from "vitest";

import { clerkInstance, clerkToken } from "../test/clerk.js";
import { signedInAs, testApp } from "../test/harness.js";

const ALICE = signedInAs("user_alice");

const STORAGE = "https://project.supabase.co/storage/v1";
const OID = "a".repeat(64);

/** The bench press's summary, as `GET /v1/exercises` answers it in English. */
const benchPress = {
  difficulty: "intermediate",
  // core's order, whatever order the bundle wrote it in
  equipment: ["barbell", "bench"],
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  name: "Bench press",
  secondary_muscle_groups: ["triceps", "shoulders"],
  slug: "barbell-bench-press",
  thumbnail_url: `${STORAGE}/render/image/public/library/barbell-bench-press/${OID}.webp`,
  video_url: `${STORAGE}/object/public/library/barbell-bench-press/${OID}.mp4`,
};

const get = (
  app: ReturnType<typeof testApp>["app"],
  path: string,
  headers: Record<string, string> = ALICE
) => app.request(path, { headers });

const namesOf = async (response: Response) => {
  const body = (await response.json()) as { data: { name: string }[] };

  return body.data.map((exercise) => exercise.name);
};

describe("GET /v1/exercises", () => {
  it("lists every Exercise alphabetically by name, as summaries", async () => {
    const { app } = testApp();

    const response = await get(app, "/v1/exercises");

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toStrictEqual({
      data: [
        benchPress,
        expect.objectContaining({ name: "Goblet squat" }),
        expect.objectContaining({ name: "Plank" }),
      ],
      hasMore: false,
      total: 3,
    });
  });

  it("answers in the language asked for, an untranslated Exercise wholly in English", async () => {
    const { app } = testApp();

    const response = await get(app, "/v1/exercises?language=uk");

    // Ukrainian's collation puts Cyrillic before Latin
    await expect(namesOf(response)).resolves.toStrictEqual([
      "Жим лежачи",
      "Присідання з гирею",
      "Plank",
    ]);
  });

  it("searches the name in the language, the English name and the other names", async () => {
    const { app } = testApp();

    const ukrainian = await get(
      app,
      "/v1/exercises?language=uk&search=%20%D0%B6%D0%B8%D0%BC%20"
    );

    const english = await get(app, "/v1/exercises?language=uk&search=goblet");
    const alias = await get(app, "/v1/exercises?search=FLAT");

    await expect(namesOf(ukrainian)).resolves.toStrictEqual(["Жим лежачи"]);
    await expect(namesOf(english)).resolves.toStrictEqual([
      "Присідання з гирею",
    ]);
    await expect(namesOf(alias)).resolves.toStrictEqual(["Bench press"]);
  });

  it("filters by primary muscle groups and by Equipment, together", async () => {
    const { app } = testApp();

    const groups = await get(app, "/v1/exercises?muscle_groups=core,chest");
    // the bench press has shoulders as a secondary group only
    const secondary = await get(app, "/v1/exercises?muscle_groups=shoulders");
    const equipment = await get(app, "/v1/exercises?equipment=kettlebell");

    const both = await get(
      app,
      "/v1/exercises?muscle_groups=core,chest&equipment=bench"
    );

    await expect(namesOf(groups)).resolves.toStrictEqual([
      "Bench press",
      "Plank",
    ]);
    await expect(namesOf(secondary)).resolves.toStrictEqual([]);
    await expect(namesOf(equipment)).resolves.toStrictEqual(["Goblet squat"]);
    await expect(namesOf(both)).resolves.toStrictEqual(["Bench press"]);
  });

  it("pages with limit and offset", async () => {
    const { app } = testApp();

    const first = await get(app, "/v1/exercises?limit=2");
    const last = await get(app, "/v1/exercises?limit=2&offset=2");
    const past = await get(app, "/v1/exercises?offset=10");

    await expect(first.json()).resolves.toMatchObject({
      hasMore: true,
      total: 3,
    });
    await expect(namesOf(last)).resolves.toStrictEqual(["Plank"]);
    await expect(past.json()).resolves.toStrictEqual({
      data: [],
      hasMore: false,
      total: 3,
    });
  });

  it("looks a batch up by slug in asked order, an old slug resolving to its replacement", async () => {
    const { app } = testApp();

    const response = await get(
      app,
      "/v1/exercises?slugs=plank,nope,bench-press,plank&language=uk"
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      data: { name: string; requested_slug: string; slug: string }[];
      missing: string[];
    };

    expect(
      body.data.map(({ name, requested_slug, slug }) => ({
        name,
        requested_slug,
        slug,
      }))
    ).toStrictEqual([
      { name: "Plank", requested_slug: "plank", slug: "plank" },
      {
        name: "Жим лежачи",
        requested_slug: "bench-press",
        slug: "barbell-bench-press",
      },
    ]);
    expect(body.missing).toStrictEqual(["nope"]);
  });

  it.each([
    ["an unknown language", "language=ru"],
    ["an unknown muscle group", "muscle_groups=abs"],
    ["an empty muscle group", "muscle_groups=chest,"],
    ["an unknown piece of Equipment", "equipment=rope"],
    ["a limit over 50", "limit=51"],
    ["a negative offset", "offset=-1"],
    ["a search over 100 characters", `search=${"a".repeat(101)}`],
    [
      "more than 40 slugs",
      `slugs=${Array.from({ length: 41 }, (_, i) => `s${i}`).join(",")}`,
    ],
    ["slugs with a list parameter", "slugs=plank&limit=5"],
  ])("answers %s 400 invalid_request", async (_, query) => {
    const { app } = testApp();

    const response = await get(app, `/v1/exercises?${query}`);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    });
  });
});

describe("GET /v1/exercises/{slug}", () => {
  it("answers one Exercise in full", async () => {
    const { app } = testApp();

    const response = await get(app, "/v1/exercises/barbell-bench-press");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: {
        ...benchPress,
        benefits: ["Bench press benefit"],
        common_mistakes: ["Bench press mistake"],
        long_description: "Bench press, at length.",
        short_description: "Bench press, briefly.",
        steps: ["Bench press step one", "Bench press step two"],
      },
    });
  });

  it("answers in the language asked for, an untranslated Exercise wholly in English", async () => {
    const { app } = testApp();

    const translated = await get(app, "/v1/exercises/goblet-squat?language=uk");
    const untranslated = await get(app, "/v1/exercises/plank?language=uk");

    await expect(translated.json()).resolves.toMatchObject({
      data: {
        name: "Присідання з гирею",
        steps: ["Присідання з гирею step one", "Присідання з гирею step two"],
      },
    });
    await expect(untranslated.json()).resolves.toMatchObject({
      data: { name: "Plank", short_description: "Plank, briefly." },
    });
  });

  it("answers an old slug with the Exercise replacing it", async () => {
    const { app } = testApp();

    const response = await get(app, "/v1/exercises/bench-press");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { name: "Bench press", slug: "barbell-bench-press" },
    });
  });

  it("answers a slug no Exercise has 404 not_found", async () => {
    const { app, reported } = testApp();

    const response = await get(app, "/v1/exercises/nope");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toStrictEqual({
      error: { code: "not_found", message: "Exercise not found" },
    });
    expect(reported).toStrictEqual([]);
  });

  it("answers an unknown language 400 invalid_request", async () => {
    const { app } = testApp();

    const response = await get(app, "/v1/exercises/plank?language=ru");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_request" },
    });
  });
});

describe("the Exercise routes", () => {
  const paths = ["/v1/exercises", "/v1/exercises/plank"];

  it.each(paths)("%s answers 401 without a session token", async (path) => {
    const { app, exerciseLibrary } = testApp();

    const response = await app.request(path);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthorized" },
    });
    expect(exerciseLibrary.state.loads).toBe(0);
  });

  it.each(paths)(
    "%s answers 401 to a token from another instance",
    async (path) => {
      const { app } = testApp();
      const foreign = clerkInstance();

      const response = await app.request(path, {
        headers: {
          authorization: `Bearer ${clerkToken(foreign.privateKey, { sub: "user_alice" })}`,
        },
      });

      expect(response.status).toBe(401);
    }
  );

  it("counts every request against the User's limit and answers the next one 429", async () => {
    const { app } = testApp({
      rateLimiter: memoryRateLimiter({ limit: 2, windowMs: 60_000 }),
    });

    const responses = await Promise.all(
      [...paths, "/v1/exercises"].map(async (path) => await get(app, path))
    );

    expect(
      responses.map((response) => response.status).toSorted((a, b) => a - b)
    ).toStrictEqual([200, 200, 429]);
  });

  it.each(paths)(
    "%s is cacheable for an hour with the Library's hash as its ETag, answering 304 on a match",
    async (path) => {
      const { app } = testApp();

      const first = await get(app, path);
      const etag = first.headers.get("ETag");

      expect(first.headers.get("Cache-Control")).toBe("private, max-age=3600");
      expect(etag).toMatch(/^"[0-9a-f]{64}"$/u);

      const again = await get(app, path, {
        ...ALICE,
        "If-None-Match": `W/${etag}`,
      });

      const stale = await get(app, path, {
        ...ALICE,
        "If-None-Match": '"stale"',
      });

      expect({
        body: await again.text(),
        cacheControl: again.headers.get("Cache-Control"),
        etag: again.headers.get("ETag"),
        stale: stale.status,
        status: again.status,
      }).toStrictEqual({
        body: "",
        cacheControl: "private, max-age=3600",
        etag,
        stale: 200,
        status: 304,
      });
    }
  );

  it("gives every route and language the same ETag, and never caches a 404", async () => {
    const { app } = testApp();

    const list = await get(app, "/v1/exercises?language=uk");
    const one = await get(app, "/v1/exercises/plank");
    const etag = list.headers.get("ETag") ?? "";

    const missing = await get(app, "/v1/exercises/nope", {
      ...ALICE,
      "If-None-Match": etag,
    });

    expect(one.headers.get("ETag")).toBe(etag);
    expect(missing.status).toBe(404);
    expect(missing.headers.get("ETag")).toBeNull();
  });

  it.each(paths)(
    "%s answers 503 library_unavailable when the bundle can't load, the load reported once",
    async (path) => {
      const { app, exerciseLibrary, reported } = testApp({
        exerciseLibraryLoads: "fail",
      });

      const response = await get(app, path);

      expect(response.status).toBe(503);
      expect(response.headers.get("ETag")).toBeNull();
      await expect(response.json()).resolves.toStrictEqual({
        error: {
          code: "library_unavailable",
          message: "The Library is unavailable; try again",
        },
      });
      expect(reported).toStrictEqual([exerciseLibrary.state.outage]);
    }
  );

  it("waits a minute after a failed load before loading again", async () => {
    const { app, exerciseLibrary, reported } = testApp({
      exerciseLibraryLoads: "fail",
    });

    await get(app, "/v1/exercises");
    exerciseLibrary.clock.now = 59_999;
    const held = await get(app, "/v1/exercises/plank");
    const loadsHeld = exerciseLibrary.state.loads;
    exerciseLibrary.clock.now = 60_000;
    await get(app, "/v1/exercises");

    expect({
      loads: exerciseLibrary.state.loads,
      loadsHeld,
      reports: reported.length,
      status: held.status,
    }).toStrictEqual({ loads: 2, loadsHeld: 1, reports: 2, status: 503 });
  });

  it("loads the bundle once for the instance", async () => {
    const { app, exerciseLibrary } = testApp();

    await get(app, "/v1/exercises");
    await get(app, "/v1/exercises/plank");

    expect(exerciseLibrary.state.loads).toBe(1);
  });
});
