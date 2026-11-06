export type LibraryErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "unauthorized"
  | "unavailable";

type LibraryErrorInstance = Error & {
  readonly code: LibraryErrorCode;
  readonly status: number | undefined;
};

type LibraryRateLimitedErrorInstance = LibraryErrorInstance & {
  readonly retryAfterSeconds: number;
};

export type {
  LibraryErrorInstance as LibraryError,
  LibraryErrorInstance as LibraryUnauthorizedError,
  LibraryErrorInstance as LibraryUnavailableError,
  LibraryErrorInstance as LibraryInvalidRequestError,
  LibraryRateLimitedErrorInstance as LibraryRateLimitedError,
};

const createLibraryError = <
  Args extends unknown[],
  ParentArgs extends unknown[],
>(
  name: string,
  Parent: new (...args: ParentArgs) => Error,
  initialize: (...args: Args) => {
    args: ParentArgs;
    properties?: Partial<LibraryRateLimitedErrorInstance>;
  }
) => {
  class LibraryErrorType extends Parent {
    declare readonly code: LibraryErrorCode;
    /** The HTTP status, when the API answered. */
    declare readonly status: number | undefined;
    declare readonly retryAfterSeconds: number;

    constructor(...args: Args) {
      const initialized = initialize(...args);
      super(...initialized.args);
      // keeps `instanceof` working where classes are transpiled (React Native's Babel)
      Object.setPrototypeOf(this, new.target.prototype);
      this.name = name;
      Object.assign(this, initialized.properties);
    }
  }

  Object.defineProperty(LibraryErrorType, "name", { value: name });
  Object.defineProperty(LibraryErrorType, "length", {
    value: initialize.length,
  });

  return LibraryErrorType;
};

/** Every failure of the Library client; match on `code` or the subclass. */
export const LibraryError: new (
  code: LibraryErrorCode,
  message: string,
  options?: { cause?: unknown; status?: number }
) => LibraryErrorInstance = createLibraryError(
  "LibraryError",
  Error,
  (
    code: LibraryErrorCode,
    message: string,
    options: { cause?: unknown; status?: number } = {}
  ) => ({
    args: [message, { cause: options.cause }],
    properties: { code, status: options.status },
  })
);

/** 401: no valid Clerk session token or server secret (or no token at all). */
export const LibraryUnauthorizedError: new (options?: {
  status?: number;
}) => LibraryErrorInstance = createLibraryError(
  "LibraryUnauthorizedError",
  LibraryError,
  (options: { status?: number } = {}) => ({
    args: ["unauthorized", "Not authorized to read the Library", options],
  })
);

/** 429: the User is over their limit; retry after `retryAfterSeconds`. */
export const LibraryRateLimitedError: new (
  retryAfterSeconds: number
) => LibraryRateLimitedErrorInstance = createLibraryError(
  "LibraryRateLimitedError",
  LibraryError,
  (retryAfterSeconds: number) => ({
    args: [
      "rate_limited",
      `Library rate limit reached, retry after ${retryAfterSeconds}s`,
      { status: 429 },
    ],
    properties: { retryAfterSeconds },
  })
);

/** A network failure, a timeout, a 5xx or an unreadable answer: worth retrying later. */
export const LibraryUnavailableError: new (options?: {
  cause?: unknown;
  status?: number;
}) => LibraryErrorInstance = createLibraryError(
  "LibraryUnavailableError",
  LibraryError,
  (options: { cause?: unknown; status?: number } = {}) => ({
    args: ["unavailable", "The Library is unavailable", options],
  })
);

/** 400: a parameter the API rejects (a limit over 50, a search over 100 characters, …). */
export const LibraryInvalidRequestError: new (
  message: string
) => LibraryErrorInstance = createLibraryError(
  "LibraryInvalidRequestError",
  LibraryError,
  (message: string) => ({
    args: ["invalid_request", message, { status: 400 }],
  })
);
