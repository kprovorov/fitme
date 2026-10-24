import createClient, { type Client } from "openapi-fetch";
import type { paths } from "~/lib/api/schema";

/** Seconds to wait after a 429 whose `Retry-After` can't be read. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

/**
 * Every failed Public API call: a non-2xx answer (`status`, the API's `code`
 * and `message`), a network failure or an unset `EXPO_PUBLIC_API_URL`
 * (`status` and `code` `null`). A 429 also carries `retryAfterSeconds`.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    {
      cause,
      code = null,
      retryAfterSeconds = null,
      status = null,
    }: {
      cause?: unknown;
      code?: string | null;
      retryAfterSeconds?: number | null;
      status?: number | null;
    } = {}
  ) {
    super(message, { cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The seconds to wait before retrying, when `error` is the API's 429. */
export const rateLimitedFor = (error: unknown): number | null =>
  error instanceof ApiError && error.code === "rate_limited"
    ? error.retryAfterSeconds
    : null;

const retryAfter = (response: Response): number => {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : DEFAULT_RETRY_AFTER_SECONDS;
};

/** The API's `{ error: { code, message } }`, or whatever of it can be read. */
const errorFrom = async (response: Response): Promise<ApiError> => {
  let code: string | null = null;
  let message = `Public API request failed (${response.status})`;
  try {
    const { error } = (await response.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    const { code: errorCode, message: errorMessage } = error ?? {};
    if (typeof errorCode === "string") {
      code = errorCode;
    }
    if (typeof errorMessage === "string") {
      message = errorMessage;
    }
  } catch {
    // Not the API's JSON (a proxy's error page): the status says enough.
  }
  return new ApiError(message, {
    code,
    retryAfterSeconds: response.status === 429 ? retryAfter(response) : null,
    status: response.status,
  });
};

export type PublicApiFetch = (
  url: string,
  init: RequestInit
) => Promise<Response>;

export interface PublicApiOptions {
  /** `apps/api`'s base URL without a trailing slash, read on every call. */
  baseUrl: () => string;
  /** Defaults to the global `fetch`, looked up per request. */
  fetch?: PublicApiFetch;
  /** The bearer, resolved per request; `null` sends none. */
  token: () => Promise<string | null>;
}

export type PublicApi = Client<paths>;

/**
 * A getter for the Public API client (`openapi-fetch`, typed from
 * `apps/api/openapi.json`). Every call sends the token as the bearer and
 * resolves to the 2xx answer; anything else rejects with an `ApiError`. The
 * getter throws an `ApiError` when the base URL is unset: no write falls back
 * to another path.
 */
export const createPublicApi = ({
  baseUrl,
  fetch: fetchImpl,
  token,
}: PublicApiOptions): (() => PublicApi) => {
  // openapi-fetch builds a `Request`, which is passed on as a URL and an init
  // so any `fetch` (expo/fetch, a test's fake) can take it.
  const send = async (request: Request): Promise<Response> => {
    const headers = new Headers(request.headers);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    let response: Response;
    try {
      // Inside the `try`: Clerk failing to refresh the token offline is a
      // network failure too.
      const bearer = await token();
      if (bearer) {
        headers.set("Authorization", `Bearer ${bearer}`);
      }
      response = await (fetchImpl ?? globalThis.fetch)(request.url, {
        body: hasBody ? await request.text() : undefined,
        headers,
        method: request.method,
        signal: request.signal,
      });
    } catch (cause) {
      throw new ApiError("Network request failed", { cause });
    }
    if (!response.ok) {
      throw await errorFrom(response);
    }
    return response;
  };

  let current: { client: PublicApi; url: string } | undefined;
  return () => {
    const url = baseUrl();
    if (!url) {
      throw new ApiError("EXPO_PUBLIC_API_URL is not set");
    }
    if (current?.url !== url) {
      current = {
        client: createClient<paths>({ baseUrl: url, fetch: send }),
        url,
      };
    }
    return current.client;
  };
};
