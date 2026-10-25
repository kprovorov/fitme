import {
  ExerciseLibraryError,
  ExerciseLibraryInvalidRequestError,
  ExerciseLibraryRateLimitedError,
  ExerciseLibraryUnauthorizedError,
  ExerciseLibraryUnavailableError,
} from "./errors";
import type {
  Exercise,
  ExerciseBatch,
  ExerciseLibrary,
  ExercisePage,
  ExerciseSummary,
} from "./types";

/** The API's limit on `GET /exercises?slugs=`. */
export const MAX_LOOKUP_SLUGS = 40;

/** How long a request (answer included) gets before it fails unavailable. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** The API's rate limit window, for a 429 whose `Retry-After` can't be read. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

const TRAILING_SLASHES = /\/+$/;
const WHOLE_SECONDS = /^\d+$/;

export interface ExerciseLibraryOptions {
  /** Defaults to the global `fetch` (Node, React Native). */
  fetch?: typeof globalThis.fetch;
  /** Defaults to `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
  /**
   * The bearer for each request: a server secret for Arnold and MCP, the
   * User's Clerk session token for mobile.
   */
  token: () => Promise<string | null | undefined>;
  /** The Exercise Library API's origin, e.g. `https://exercises.fitmeproject.com`. */
  url: string;
}

/** A slug the API can't be asked for: it would split or fail the request. */
const isUnaskable = (slug: string) => slug === "" || slug.includes(",");

type QueryParams = Record<string, string | number | undefined>;

/**
 * `?a=1&b=2` from the defined parameters, or nothing. Built by hand rather
 * than with `URLSearchParams`, which React Native has only implemented in part.
 */
const queryString = (params: QueryParams) => {
  const pairs = Object.entries(params).flatMap(([key, value]) =>
    value === undefined
      ? []
      : `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  );
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
};

const retryAfterSeconds = (header: string | null) =>
  header && WHOLE_SECONDS.test(header.trim())
    ? Number(header.trim())
    : DEFAULT_RETRY_AFTER_SECONDS;

/** The `{ error: { message } }` an API error answers with, if it's readable. */
const errorMessage = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: unknown };
  } | null;
  const message = body?.error?.message;
  return typeof message === "string" ? message : undefined;
};

// Answers are checked before they're trusted (no zod here, so by hand): a
// malformed 200 is an outage, never Exercises silently reported missing.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Muscle groups are only checked to be strings, so a new one never fails an old client. */
const isSummary = (value: unknown): value is ExerciseSummary =>
  isRecord(value) &&
  typeof value.slug === "string" &&
  typeof value.name === "string" &&
  isStringArray(value.muscle_groups) &&
  typeof value.thumbnail_url === "string" &&
  typeof value.video_url === "string";

const hasSummaries = (value: Record<string, unknown>) =>
  Array.isArray(value.data) && value.data.every(isSummary);

const isPage = (value: unknown): value is ExercisePage =>
  isRecord(value) &&
  hasSummaries(value) &&
  typeof value.total === "number" &&
  typeof value.hasMore === "boolean";

const isBatch = (value: unknown): value is ExerciseBatch =>
  isRecord(value) && hasSummaries(value) && isStringArray(value.missing);

const isExercise = (value: unknown): value is Exercise =>
  isRecord(value) &&
  typeof value.description === "string" &&
  typeof value.instructions === "string" &&
  isSummary(value);

/** `GET /exercises/:slug` answers 404 for a slug no Exercise has. */
const NOT_FOUND = 404;

/** The typed error for an answer that isn't a 2xx. */
const failure = async (response: Response) => {
  switch (response.status) {
    case 400:
      return new ExerciseLibraryInvalidRequestError(
        (await errorMessage(response)) ?? "Invalid Exercise Library request"
      );
    case 401:
      return new ExerciseLibraryUnauthorizedError({ status: 401 });
    case 429:
      return new ExerciseLibraryRateLimitedError(
        retryAfterSeconds(response.headers.get("retry-after"))
      );
    default:
      return new ExerciseLibraryUnavailableError({ status: response.status });
  }
};

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size)
  );

export const createExerciseLibrary = ({
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  token,
  url,
}: ExerciseLibraryOptions): ExerciseLibrary => {
  const base = url.replace(TRAILING_SLASHES, "");

  // A token getter that throws (Clerk offline) is a failure to reach the
  // library; no token at all (signed out) is unauthorized, without a request.
  const bearer = async () => {
    // through a promise chain, so a getter that throws synchronously is caught too
    const value = await Promise.resolve()
      .then(token)
      .catch((cause: unknown) => {
        throw new ExerciseLibraryUnavailableError({ cause });
      });
    if (!value) {
      throw new ExerciseLibraryUnauthorizedError();
    }
    return value;
  };

  /** `null` for a 404 when `allowNotFound`; any other non-2xx fails typed. */
  const request = async <T>(
    path: string,
    params: QueryParams,
    isAnswer: (body: unknown) => body is T,
    { allowNotFound = false } = {}
  ): Promise<T | null> => {
    const authorization = `Bearer ${await bearer()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let body: unknown;
    try {
      response = await fetch(`${base}${path}${queryString(params)}`, {
        headers: { accept: "application/json", authorization },
        signal: controller.signal,
      });
      if (allowNotFound && response.status === NOT_FOUND) {
        return null;
      }
      if (!response.ok) {
        throw await failure(response);
      }
      body = await response.json();
    } catch (error) {
      throw error instanceof ExerciseLibraryError
        ? error
        : new ExerciseLibraryUnavailableError({ cause: error });
    } finally {
      clearTimeout(timeout);
    }
    if (!isAnswer(body)) {
      throw new ExerciseLibraryUnavailableError({ status: response.status });
    }
    return body;
  };

  /** `GET /exercises`, which never answers 404. */
  const getExercises = async <T>(
    params: QueryParams,
    isAnswer: (body: unknown) => body is T
  ) => (await request("/exercises", params, isAnswer)) as T;

  return {
    get: (slug) =>
      slug === ""
        ? Promise.resolve(null)
        : request(`/exercises/${encodeURIComponent(slug)}`, {}, isExercise, {
            allowNotFound: true,
          }),

    list: ({ limit, muscleGroup, offset, search } = {}) =>
      getExercises(
        { limit, muscle_group: muscleGroup, offset, search },
        isPage
      ),

    lookup: async (slugs) => {
      const unique = [...new Set(slugs)];
      const asked = unique.filter((slug) => !isUnaskable(slug));
      const batches = await Promise.all(
        chunk(asked, MAX_LOOKUP_SLUGS).map((batch) =>
          getExercises({ slugs: batch.join(",") }, isBatch)
        )
      );
      const found = new Map(
        batches.flatMap((batch) => batch.data.map((e) => [e.slug, e] as const))
      );
      return {
        data: unique.flatMap((slug) => found.get(slug) ?? []),
        missing: unique.filter((slug) => !found.has(slug)),
      };
    },
  };
};
