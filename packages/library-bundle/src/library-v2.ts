import { createInMemoryLibrary } from "./in-memory-library";
import type { InMemoryLibrary } from "./in-memory-library";
import { loadInTime } from "./load-in-time";
import { LibraryBundleV2 } from "./schema-v2";

/** What asking for the instance's Library answers. */
export type LibraryV2Answer =
  | { library: InMemoryLibrary; status: "ready" }
  /** The load failed or timed out (reported); the next ask tries again. */
  | { status: "unavailable" };

export interface LibraryV2 {
  /** The instance's Library, loading it on the first ask (and after a failed one). */
  get: () => Promise<LibraryV2Answer>;
}

/** How long a load may take before it counts as failed, so a slow Blob never holds a request. */
export const LIBRARY_V2_LOAD_TIMEOUT_MS = 10_000;

/** Validates a parsed v2 bundle, throwing every problem with its path. */
const readBundle = (json: unknown) => {
  const parsed = LibraryBundleV2.safeParse(json);

  if (!parsed.success) {
    throw new Error(
      `Invalid Library v2 bundle: ${parsed.error.issues
        .map((issue) =>
          issue.path.length > 0
            ? `${issue.path.join(".")}: ${issue.message}`
            : issue.message
        )
        .join("; ")}`
    );
  }

  return parsed.data;
};

/**
 * The instance's new Library (ADR 0022): `load` (see `libraryV2BundleSource`)
 * runs on the first `get`, its answer is validated against the v2 schema and
 * built into the in-memory Library once, then kept for the life of the
 * instance and never reloaded: a new bundle reaches an app by its redeploy.
 *
 * - Concurrent first asks share one load.
 * - A load that fails, times out (`loadTimeoutMs`) or answers an invalid
 *   bundle is reported through `reportError` and answers `unavailable`; the
 *   next `get` loads again.
 * - Media URLs are on the Supabase project at `supabaseUrl`.
 */
export const createLibraryV2 = ({
  load,
  loadTimeoutMs = LIBRARY_V2_LOAD_TIMEOUT_MS,
  reportError,
  supabaseUrl,
}: {
  load: () => Promise<unknown>;
  loadTimeoutMs?: number;
  reportError: (error: Error) => Promise<void> | void;
  supabaseUrl: string;
}): LibraryV2 => {
  let library: InMemoryLibrary | null = null;
  let loading: Promise<void> | null = null;

  const loadOnce = async () => {
    try {
      const json = await loadInTime(load, {
        timeoutMs: loadTimeoutMs,
        what: "Library v2 bundle",
      });

      library = createInMemoryLibrary(readBundle(json), { supabaseUrl });
    } catch (error) {
      await reportError(
        error instanceof Error
          ? error
          : new Error("Library v2 bundle load failed", { cause: error })
      );
    }
  };

  return {
    get: async () => {
      if (!library) {
        loading ??= loadOnce().finally(() => {
          loading = null;
        });

        await loading;
      }

      return library ? { library, status: "ready" } : { status: "unavailable" };
    },
  };
};
