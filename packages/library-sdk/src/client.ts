import {
  LibraryError,
  LibraryInvalidRequestError,
  LibraryRateLimitedError,
  LibraryUnauthorizedError,
  LibraryUnavailableError,
} from "./errors";
import type { Cover, Library } from "./types";

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
  /** The bearer for each request: the User's Clerk session token. */
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

const retryAfterSeconds = (header: string | null) =>
  header !== null && WHOLE_SECONDS.test(header.trim())
    ? Number(header.trim())
    : DEFAULT_RETRY_AFTER_SECONDS;

// Answers are checked before they're trusted (no zod here, so by hand): a
// malformed 200 is an outage, never an empty list of Covers.
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

/** A Cover's muscle groups are only checked to be strings, so a new one never fails an old client. */
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

  /** `GET <path>`, its answer checked; any non-2xx fails typed. */
  const request = async <T>(
    path: string,
    isAnswer: (body: unknown) => body is T
  ): Promise<T> => {
    const authorization = `Bearer ${await bearer()}`;
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    let response: Response;
    let body: unknown;

    try {
      response = await fetch(`${base}${path}`, {
        headers: { accept: "application/json", authorization },
        signal: controller.signal,
      });

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
  };

  return {
    covers: async () => {
      const list = await request("/covers", isCoverList);

      return list.data;
    },
  };
};
