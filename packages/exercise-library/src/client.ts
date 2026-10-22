import {
  ExerciseLibraryError,
  ExerciseLibraryInvalidRequestError,
  ExerciseLibraryRateLimitedError,
  ExerciseLibraryUnauthorizedError,
  ExerciseLibraryUnavailableError,
} from "./errors";
import type { ExerciseBatch, ExerciseLibrary, ExercisePage } from "./types";

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
   * The bearer for each request: a server secret for the Coach and MCP, the
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

/** Both the page and the batch answer carry a `data` array. */
const hasData = (body: unknown) =>
  typeof body === "object" &&
  body !== null &&
  Array.isArray((body as { data?: unknown }).data);

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

  const get = async <T>(params: QueryParams): Promise<T> => {
    const authorization = `Bearer ${await bearer()}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let body: unknown;
    try {
      response = await fetch(`${base}/exercises${queryString(params)}`, {
        headers: { accept: "application/json", authorization },
        signal: controller.signal,
      });
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
    if (!hasData(body)) {
      throw new ExerciseLibraryUnavailableError({ status: response.status });
    }
    return body as T;
  };

  return {
    list: ({ limit, muscleGroup, offset, search } = {}) =>
      get<ExercisePage>({
        limit,
        muscle_group: muscleGroup,
        offset,
        search,
      }),

    lookup: async (slugs) => {
      const unique = [...new Set(slugs)];
      const asked = unique.filter((slug) => !isUnaskable(slug));
      const batches = await Promise.all(
        chunk(asked, MAX_LOOKUP_SLUGS).map((batch) =>
          get<ExerciseBatch>({ slugs: batch.join(",") })
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
