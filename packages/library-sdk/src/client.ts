import {
  LibraryError,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
} from "./errors";
import type {
  Cover,
  Exercise,
  ExerciseBatch,
  ExercisePage,
  ExerciseSummary,
  Library,
} from "./types";

/** The API's limit on `GET /exercises?slugs=`. */
export const MAX_LOOKUP_SLUGS = 40;

/** How long a request (answer included) gets before it fails unavailable. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** The API's rate limit window, for a 429 whose `Retry-After` can't be read. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

const WHOLE_SECONDS = /^\d+$/u;

export interface LibraryOptions {
  /** Defaults to the global `fetch` (Node, React Native). */
  fetch?: typeof globalThis.fetch;
  /** Defaults to `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
  /**
   * The bearer for each request: a server secret for Arnold and MCP, the
   * User's Clerk session token for mobile.
   */
  token: () => Promise<string | null | undefined>;
  /** The Library API's origin, e.g. `https://library.fitmeproject.com`. */
  url: string;
}

/**
 * `url` without its trailing slashes. A loop rather than `/\/+$/`, which
 * backtracks polynomially on a long run of slashes followed by anything else.
 */
const withoutTrailingSlashes = (url: string) => {
  let end = url.length;

  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }

  return url.slice(0, end);
};

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
  header !== null && WHOLE_SECONDS.test(header.trim())
    ? Number(header.trim())
    : DEFAULT_RETRY_AFTER_SECONDS;

// Answers are checked before they're trusted (no zod here, so by hand): a
// malformed 200 is an outage, never Exercises silently reported missing.
const isRecord = (value: unknown): value is object =>
  typeof value === "object" && value !== null;

const isErrorBody = (value: unknown): value is { error: { message: string } } =>
  isRecord(value) &&
  "error" in value &&
  isRecord(value.error) &&
  "message" in value.error &&
  typeof value.error.message === "string";

/** The `{ error: { message } }` an API error answers with, if it's readable. */
const errorMessage = async (response: Response) => {
  const body: unknown = await response.json().catch(() => null);

  return isErrorBody(body) ? body.error.message : undefined;
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((item: unknown): item is string => typeof item === "string");

/**
 * Muscle groups and Equipment are only checked to be strings, so a new value
 * of either never fails an old client.
 */
const isSummary = (value: unknown): value is ExerciseSummary =>
  isRecord(value) &&
  "slug" in value &&
  typeof value.slug === "string" &&
  "name" in value &&
  typeof value.name === "string" &&
  "equipment" in value &&
  isStringArray(value.equipment) &&
  "muscle_groups" in value &&
  isStringArray(value.muscle_groups) &&
  "thumbnail_url" in value &&
  typeof value.thumbnail_url === "string" &&
  "video_url" in value &&
  typeof value.video_url === "string";

const hasSummaries = (value: unknown): value is { data: ExerciseSummary[] } =>
  isRecord(value) &&
  "data" in value &&
  Array.isArray(value.data) &&
  value.data.every(isSummary);

const isPage = (value: unknown): value is ExercisePage =>
  hasSummaries(value) &&
  "total" in value &&
  typeof value.total === "number" &&
  "hasMore" in value &&
  typeof value.hasMore === "boolean";

const isBatch = (value: unknown): value is ExerciseBatch =>
  hasSummaries(value) && "missing" in value && isStringArray(value.missing);

const isExercise = (value: unknown): value is Exercise =>
  isRecord(value) &&
  "description" in value &&
  typeof value.description === "string" &&
  "instructions" in value &&
  typeof value.instructions === "string" &&
  isSummary(value);

/** A Cover's muscle groups, like an Exercise's, are only checked to be strings. */
const isCover = (value: unknown): value is Cover =>
  isRecord(value) &&
  "id" in value &&
  typeof value.id === "string" &&
  "image_url" in value &&
  typeof value.image_url === "string" &&
  "muscle_groups" in value &&
  isStringArray(value.muscle_groups);

const isCoverList = (value: unknown): value is { data: Cover[] } =>
  isRecord(value) &&
  "data" in value &&
  Array.isArray(value.data) &&
  value.data.every(isCover);

/** `GET /exercises/:slug` answers 404 for a slug no Exercise has. */
const NOT_FOUND = 404;

/** The typed error for an answer that isn't a 2xx. */
const failure = async (response: Response) => {
  switch (response.status) {
    case 400: {
      return new LibraryInvalidRequestError(
        (await errorMessage(response)) ?? "Invalid Library request"
      );
    }

    case 401: {
      return new LibraryUnauthorizedError({ status: 401 });
    }

    case 429: {
      return new LibraryRateLimitedError(
        retryAfterSeconds(response.headers.get("retry-after"))
      );
    }

    default: {
      return new LibraryUnavailableError({ status: response.status });
    }
  }
};

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size)
  );

export const createLibrary = ({
  fetch = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  token,
  url,
}: LibraryOptions): Library => {
  const base = withoutTrailingSlashes(url);

  // A token getter that throws (Clerk offline) is a failure to reach the
  // library; no token at all (signed out) is unauthorized, without a request.
  const bearer = async () => {
    let value: string | null | undefined;

    try {
      value = await token();
    } catch (error) {
      throw new LibraryUnavailableError({ cause: error });
    }

    if (value === null || value === undefined || value === "") {
      throw new LibraryUnauthorizedError();
    }

    return value;
  };

  function request<T>(
    path: string,
    params: QueryParams,
    isAnswer: (body: unknown) => body is T
  ): Promise<T>;
  function request<T>(
    path: string,
    params: QueryParams,
    isAnswer: (body: unknown) => body is T,
    options: { allowNotFound: true }
  ): Promise<T | null>;
  /** `null` for a 404 when `allowNotFound`; any other non-2xx fails typed. */
  async function request<T>(
    path: string,
    params: QueryParams,
    isAnswer: (body: unknown) => body is T,
    { allowNotFound = false } = {}
  ): Promise<T | null> {
    const authorization = `Bearer ${await bearer()}`;
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

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
      throw error instanceof LibraryError
        ? error
        : new LibraryUnavailableError({ cause: error });
    } finally {
      clearTimeout(timeout);
    }

    if (!isAnswer(body)) {
      throw new LibraryUnavailableError({ status: response.status });
    }

    return body;
  }

  /** `GET /exercises`, which never answers 404. */
  const getExercises = async <T>(
    params: QueryParams,
    isAnswer: (body: unknown) => body is T
  ) => await request("/exercises", params, isAnswer);

  return {
    covers: async () => {
      const list = await request("/covers", {}, isCoverList);

      return list.data;
    },

    get: async (slug, { language } = {}) =>
      slug === ""
        ? await Promise.resolve(null)
        : await request(
            `/exercises/${encodeURIComponent(slug)}`,
            { language },
            isExercise,
            { allowNotFound: true }
          ),

    list: async ({
      equipment,
      language,
      limit,
      muscleGroup,
      muscleGroups,
      offset,
      search,
    } = {}) =>
      await getExercises(
        {
          equipment:
            equipment !== undefined && equipment.length > 0
              ? equipment.join(",")
              : undefined,
          language,
          limit,
          muscle_group: muscleGroup,
          muscle_groups:
            muscleGroups !== undefined && muscleGroups.length > 0
              ? muscleGroups.join(",")
              : undefined,
          offset,
          search,
        },
        isPage
      ),

    lookup: async (slugs, { language } = {}) => {
      const unique = [...new Set(slugs)];
      const asked = unique.filter((slug) => !isUnaskable(slug));

      const batches = await Promise.all(
        chunk(asked, MAX_LOOKUP_SLUGS).map(
          async (batch) =>
            await getExercises({ language, slugs: batch.join(",") }, isBatch)
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
