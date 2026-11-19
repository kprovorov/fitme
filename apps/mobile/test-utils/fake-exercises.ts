/**
 * The fake Public API's Exercise routes (`GET /v1/exercises`, its `slugs`
 * lookup and `GET /v1/exercises/{slug}`, ADR 0022), over Exercises a test
 * seeds with `serveExercises`. Their answers come from the same in-memory
 * Library the Public API serves (`@fitme/library-bundle/in-memory-library`),
 * so order, collation, search (aliases included), filters, paging and old
 * slugs are exactly the API's; this file only checks the query as the routes
 * do. `failExercises` fails both routes until it's given `null`, and the fake
 * Public API's slug-checking writes check against the served Exercises
 * (`checkServedSlugs`), as the Public API does (FIT-747).
 * `fakePublicApi.reset()` empties it after each test. Covers stay the Library
 * fake's (`serveLibrary` with `{ covers }`).
 */

import type { components } from "@fitme/api-client";
import {
  appLanguages,
  defaultAppLanguage,
  equipment as equipmentList,
  MAX_EXERCISE_SLUG_LENGTH,
  muscleGroups,
} from "@fitme/core";
import { createInMemoryLibrary } from "@fitme/library-bundle/in-memory-library";
import type { InMemoryLibrary } from "@fitme/library-bundle/in-memory-library";
import type {
  BundleV2Exercise,
  BundleV2ExerciseText,
  LibraryBundleV2,
} from "@fitme/library-bundle/v2";
import { exerciseNameFromSlug } from "@fitme/library-sdk";
import { z } from "zod";

/** The Supabase origin the served media URLs are on. */
export const FAKE_SUPABASE_URL = "https://fake-supabase.test";

/** The API's `Cache-Control` on every Exercise answer. */
export const EXERCISES_CACHE_CONTROL = "private, max-age=3600";

type TranslatedLanguage = Exclude<(typeof appLanguages)[number], "en">;

/** An Exercise's text in one language, every field but its name optional. */
type FakeExerciseText = Partial<BundleV2ExerciseText> & { name: string };

export type FakeExerciseOptions = Partial<
  Omit<BundleV2Exercise, "locales" | "slug">
> & {
  /** Its English name; made from the slug unless given (`bench-press` → `Bench press`). */
  name?: string;
  /** Its text in other App languages, each filled in from its name. */
  translations?: Partial<Record<TranslatedLanguage, FakeExerciseText>>;
};

const textOf = ({ name, ...text }: FakeExerciseText): BundleV2ExerciseText => ({
  benefits: [],
  common_mistakes: [],
  long_description: `How to do ${name}`,
  short_description: `About ${name}`,
  steps: [`Do ${name}`],
  tags: [],
  use_cases: [],
  ...text,
  name,
});

/**
 * An Exercise of the new Library in English, with optional `translations`:
 * a chest push on bodyweight for beginners unless `options` say otherwise.
 */
export const fakeExercise = (
  slug: string,
  { name, translations = {}, ...fields }: FakeExerciseOptions = {}
): BundleV2Exercise => ({
  aliases: [],
  difficulty: "beginner",
  equipment: ["bodyweight"],
  locales: {
    en: textOf({ name: name ?? exerciseNameFromSlug(slug) }),
    ...Object.fromEntries(
      Object.entries(translations).map(([language, text]) => [
        language,
        textOf(text),
      ])
    ),
  },
  movement_patterns: ["push"],
  muscle_groups: ["chest"],
  secondary_muscle_groups: [],
  slug,
  thumbnail: { extension: "webp", oid: "a".repeat(64) },
  video: { extension: "mp4", oid: "b".repeat(64) },
  ...fields,
});

const emptyLibrary = () =>
  createInMemoryLibrary(
    { exercises: [], version: 2 },
    { supabaseUrl: FAKE_SUPABASE_URL }
  );

let served: InMemoryLibrary = emptyLibrary();

/**
 * Serves `exercises` (built with `fakeExercise`) from the Exercise routes,
 * replacing what was served; `replacedSlugs` maps an old slug to the one
 * replacing it, as the bundle's `replaced_slugs` does.
 */
export const serveExercises = (
  exercises: BundleV2Exercise[],
  { replacedSlugs }: { replacedSlugs?: Record<string, string> } = {}
) => {
  const bundle: LibraryBundleV2 = { exercises, version: 2 };

  if (replacedSlugs) {
    bundle.replaced_slugs = replacedSlugs;
  }

  served = createInMemoryLibrary(bundle, { supabaseUrl: FAKE_SUPABASE_URL });
};

/** How the Exercise routes fail: an error answer, or no answer at all. */
export type ExercisesFailure =
  | "network"
  | { code: string; retryAfterSeconds?: number; status: number };

let failure: ExercisesFailure | null = null;

/**
 * Fails every request to the Exercise routes with `next` until it's given
 * `null`: `{ status: 503, code: "library_unavailable" }` for an outage (which
 * the slug-checking writes then answer too), `{ status: 429, code:
 * "rate_limited", retryAfterSeconds }` for the rate limit, `"network"` for a
 * request that never reaches the API.
 */
export const failExercises = (next: ExercisesFailure | null) => {
  failure = next;
};

/** An outage, as `failExercises` takes it. */
export const EXERCISES_UNAVAILABLE: ExercisesFailure = {
  code: "library_unavailable",
  status: 503,
};

/** The rate limit, as `failExercises` takes it. */
export const exercisesRateLimited = (
  retryAfterSeconds = 30
): ExercisesFailure => ({
  code: "rate_limited",
  retryAfterSeconds,
  status: 429,
});

/** Back to no Exercises and no failure; run by `fakePublicApi.reset()`. */
export const resetExercises = () => {
  served = emptyLibrary();
  failure = null;
};

/**
 * The slugs the served Exercises don't have (an old slug in the map counts as
 * known), as the Public API's writes check them; throws during an outage
 * (`failExercises` with `library_unavailable`), which a write answers 503.
 */
export const checkServedSlugs = (slugs: readonly string[]) => {
  if (
    failure !== null &&
    failure !== "network" &&
    failure.code === EXERCISES_UNAVAILABLE.code
  ) {
    throw new Error("The Library is unavailable");
  }

  return { missing: served.checkSlugs(slugs).unknown };
};

/** The answer `failExercises` set, or `null` to answer as usual. */
const failed = (): Response | null => {
  if (failure === null) {
    return null;
  }

  if (failure === "network") {
    throw new TypeError("Network request failed");
  }

  const headers: Record<string, string> =
    failure.status === 429
      ? { "Retry-After": String(failure.retryAfterSeconds ?? 30) }
      : {};

  return json(
    failure.status,
    { error: { code: failure.code, message: failure.code } },
    headers
  );
};

// The route's query schemas (`apps/api/src/routes/exercises.ts`).
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH = 100;
const MAX_SLUGS = 40;

const LIST_PARAMETERS = [
  "equipment",
  "limit",
  "muscle_groups",
  "offset",
  "search",
] as const;

const commaSeparated = <Value extends string>(
  item: z.ZodType<Value, string>,
  { max }: { max?: number } = {}
) => {
  const items = z.array(item).min(1);

  return z
    .string()
    .transform((value) => value.split(","))
    .pipe(max === undefined ? items : items.max(max))
    .transform((values: Value[]) => [...new Set(values)]);
};

const language = z.enum(appLanguages).optional();

const listQuery = z
  .object({
    equipment: commaSeparated(z.enum(equipmentList)).optional(),
    language,
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    muscle_groups: commaSeparated(z.enum(muscleGroups)).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    search: z.string().trim().max(MAX_SEARCH).optional(),
    slugs: commaSeparated(z.string().min(1).max(MAX_EXERCISE_SLUG_LENGTH), {
      max: MAX_SLUGS,
    }).optional(),
  })
  .superRefine((query, ctx) => {
    if (query.slugs === undefined) {
      return;
    }

    for (const name of LIST_PARAMETERS) {
      if (query[name] !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "can't be combined with slugs",
          path: [name],
        });
      }
    }
  });

const getQuery = z.object({ language });
const slugParam = z.string().min(1).max(MAX_EXERCISE_SLUG_LENGTH);

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(body === null ? null : JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(headers)),
    },
    status,
  });

const invalidRequest = (issues: z.core.$ZodIssue[]) =>
  json(400, {
    error: {
      code: "invalid_request",
      message: issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    },
  });

const WEAK_PREFIX = /^W\//u;

/** The cache headers of an answer, and whether `If-None-Match` already holds it. */
const deviceCache = (requestHeaders: Headers) => {
  const etag = `"${served.hash}"`;

  const notModified =
    requestHeaders
      .get("If-None-Match")
      ?.split(",")
      .map((tag) => tag.trim())
      .some((tag) => tag === "*" || tag.replace(WEAK_PREFIX, "") === etag) ??
    false;

  return {
    headers: { "Cache-Control": EXERCISES_CACHE_CONTROL, ETag: etag },
    notModified,
  };
};

type ExercisePage = components["schemas"]["ExercisePage"];

type ExerciseLookup = components["schemas"]["ExerciseLookup"];

type Exercise = components["schemas"]["Exercise"];

/**
 * `GET /v1/exercises`: a page of the served Exercises, alphabetical in
 * `language`, or with `slugs` the batch lookup with `missing`.
 */
export const listExercises = (
  query: URLSearchParams,
  requestHeaders: Headers
): Response => {
  const failedAnswer = failed();

  if (failedAnswer) {
    return failedAnswer;
  }

  const parsed = listQuery.safeParse(Object.fromEntries(query));

  if (!parsed.success) {
    return invalidRequest(parsed.error.issues);
  }

  const { headers, notModified } = deviceCache(requestHeaders);

  if (notModified) {
    return new Response(null, { headers, status: 304 });
  }

  const {
    equipment,
    language: asked = defaultAppLanguage,
    limit = DEFAULT_LIMIT,
    muscle_groups: muscleGroupsAsked,
    offset = 0,
    search,
    slugs,
  } = parsed.data;

  if (slugs !== undefined) {
    const lookup: ExerciseLookup = served.lookup(slugs, { language: asked });

    return json(200, lookup, headers);
  }

  const page: ExercisePage = served.list({
    equipment,
    language: asked,
    limit,
    muscleGroups: muscleGroupsAsked,
    offset,
    search,
  });

  return json(200, page, headers);
};

/** `GET /v1/exercises/{slug}`: one served Exercise in full, or 404. */
export const getExercise = (
  slug: string,
  query: URLSearchParams,
  requestHeaders: Headers
): Response => {
  const failedAnswer = failed();

  if (failedAnswer) {
    return failedAnswer;
  }

  const parsedSlug = slugParam.safeParse(slug);
  const parsedQuery = getQuery.safeParse(Object.fromEntries(query));

  if (!parsedSlug.success) {
    return invalidRequest(
      parsedSlug.error.issues.map((issue) => ({ ...issue, path: ["slug"] }))
    );
  }

  if (!parsedQuery.success) {
    return invalidRequest(parsedQuery.error.issues);
  }

  const exercise: Exercise | null = served.get(parsedSlug.data, {
    language: parsedQuery.data.language ?? defaultAppLanguage,
  });

  if (!exercise) {
    return json(404, {
      error: { code: "not_found", message: "Exercise not found" },
    });
  }

  const { headers, notModified } = deviceCache(requestHeaders);

  if (notModified) {
    return new Response(null, { headers, status: 304 });
  }

  return json(200, { data: exercise }, headers);
};
