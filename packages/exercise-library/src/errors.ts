export type ExerciseLibraryErrorCode =
  | "invalid_request"
  | "rate_limited"
  | "unauthorized"
  | "unavailable";

/** Every failure of the Exercise Library client; match on `code` or the subclass. */
export class ExerciseLibraryError extends Error {
  readonly code: ExerciseLibraryErrorCode;
  /** The HTTP status, when the API answered. */
  readonly status: number | undefined;

  constructor(
    code: ExerciseLibraryErrorCode,
    message: string,
    options: { cause?: unknown; status?: number } = {}
  ) {
    super(message, { cause: options.cause });
    // keeps `instanceof` working where classes are transpiled (React Native's Babel)
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ExerciseLibraryError";
    this.code = code;
    this.status = options.status;
  }
}

/** 401: no valid Clerk session token or server secret (or no token at all). */
export class ExerciseLibraryUnauthorizedError extends ExerciseLibraryError {
  constructor(options: { status?: number } = {}) {
    super(
      "unauthorized",
      "Not authorized to read the Exercise Library",
      options
    );
    this.name = "ExerciseLibraryUnauthorizedError";
  }
}

/** 429: the User is over their limit; retry after `retryAfterSeconds`. */
export class ExerciseLibraryRateLimitedError extends ExerciseLibraryError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      "rate_limited",
      `Exercise Library rate limit reached, retry after ${retryAfterSeconds}s`,
      { status: 429 }
    );
    this.name = "ExerciseLibraryRateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A network failure, a timeout, a 5xx or an unreadable answer: worth retrying later. */
export class ExerciseLibraryUnavailableError extends ExerciseLibraryError {
  constructor(options: { cause?: unknown; status?: number } = {}) {
    super("unavailable", "The Exercise Library is unavailable", options);
    this.name = "ExerciseLibraryUnavailableError";
  }
}

/** 400: a parameter the API rejects (a limit over 50, a search over 100 characters, …). */
export class ExerciseLibraryInvalidRequestError extends ExerciseLibraryError {
  constructor(message: string) {
    super("invalid_request", message, { status: 400 });
    this.name = "ExerciseLibraryInvalidRequestError";
  }
}
