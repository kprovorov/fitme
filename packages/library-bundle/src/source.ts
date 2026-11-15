import { readFile } from "node:fs/promises";
import path from "node:path";

import { get } from "@vercel/blob";
import type { GetCommandOptions } from "@vercel/blob";

// The committed fixture of made-up Exercises the Library API serves by
// default, imported so it's inlined into every build that reads it: a
// deployed function has no repository checkout to read it from.
import fixture from "../../../apps/library/fixtures/library.json" with { type: "json" };

/** The pathname `fitme-exercises` publishes the bundle at in the private Blob store. */
export const LIBRARY_BLOB = "library.json";

/** The variables the bundle source reads (`process.env`). */
export interface BundleSourceEnv {
  /** Set by connecting the Blob store; the SDK authenticates through Vercel OIDC with it. */
  BLOB_STORE_ID?: string;
  LIBRARY_BUNDLE?: string;
  VERCEL_ENV?: string;
}

/** `get` from `@vercel/blob`, narrowed to what the loader reads. */
export type BlobGet = (
  pathname: string,
  options: GetCommandOptions
) => Promise<{ stream: ReadableStream<Uint8Array> | null } | null>;

/** Where the bundle is read from, and how. */
export interface BundleSource {
  /** Answers the parsed bundle; rejects when it can't be read. */
  load: () => Promise<unknown>;
  /** Which bundle, for logs and errors. */
  name: string;
}

const parseJson = (name: string, text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${name}: not valid JSON`, { cause: error });
  }
};

/**
 * Picks the bundle the Library index loads (ADR 0018), as the Library API's
 * build picks it:
 *
 * - production (`VERCEL_ENV=production`): `library.json` from the private Blob
 *   store, uncached so a release just published is read, over Vercel OIDC
 *   (`BLOB_STORE_ID`); a missing store or blob, or a failed fetch, rejects,
 *   and production never falls back to the fixture;
 * - anywhere else: LIBRARY_BUNDLE (absolute, or relative to the app's own
 *   working directory),
 *   or the committed fixture; Blob is never called.
 */
export const libraryBundleSource = ({
  env,
  getBlob = get,
  readText = (file) => readFile(file, "utf-8"),
}: {
  env: BundleSourceEnv;
  getBlob?: BlobGet;
  readText?: (file: string) => Promise<string>;
}): BundleSource => {
  if (env.VERCEL_ENV === "production") {
    const name = `Vercel Blob ${LIBRARY_BLOB}`;

    return {
      load: async () => {
        if (!env.BLOB_STORE_ID) {
          throw new Error(
            `${name}: no Blob store: BLOB_STORE_ID is unset (connect the store to the project's Production environment)`
          );
        }

        const blob = await getBlob(LIBRARY_BLOB, {
          access: "private",
          useCache: false,
        });

        if (!blob?.stream) {
          throw new Error(`${name}: not in the Blob store`);
        }

        return parseJson(name, await new Response(blob.stream).text());
      },
      name,
    };
  }

  if (env.LIBRARY_BUNDLE) {
    // Absolute, or relative to the app's own working directory. Never a path
    // built from this module's location or a fixed directory: Vercel's file
    // tracer follows such a path and drags all of apps/library into the
    // function, whose build then typechecks it and fails.
    const name = path.resolve(env.LIBRARY_BUNDLE);

    return {
      load: async () => parseJson(name, await readText(name)),
      name,
    };
  }

  return {
    load: () => Promise.resolve(fixture),
    name: "the committed fixture (apps/library/fixtures/library.json)",
  };
};
