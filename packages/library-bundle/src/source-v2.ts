import { readFile } from "node:fs/promises";
import path from "node:path";

import { get } from "@vercel/blob";

// The committed fixture of made-up Exercises (never real content: the
// repository is public), imported so it's inlined into every build that reads
// it: a deployed function has no repository checkout to read it from.
import fixture from "../fixtures/library-v2.json" with { type: "json" };
import { LIBRARY_V2_BLOB } from "./schema-v2";
import type { BlobGet, BundleSource } from "./source";

/** The variables the v2 bundle source reads (`process.env`). */
export interface BundleV2SourceEnv {
  /** Set by connecting the Blob store; the SDK authenticates through Vercel OIDC with it. */
  BLOB_STORE_ID?: string;
  /** Outside production: the v2 bundle to read. `LIBRARY_BUNDLE` stays the v1 one. */
  LIBRARY_V2_BUNDLE?: string;
  VERCEL_ENV?: string;
}

const parseJson = (name: string, text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${name}: not valid JSON`, { cause: error });
  }
};

/**
 * Picks the v2 bundle (ADR 0022) an instance's Library loads, as
 * `libraryBundleSource` picks the v1 one:
 *
 * - production (`VERCEL_ENV=production`): `library-v2.json` from the private
 *   Blob store, uncached, over Vercel OIDC (`BLOB_STORE_ID`); a missing store
 *   or blob, or a failed fetch, rejects, and production never falls back to
 *   the fixture;
 * - anywhere else: LIBRARY_V2_BUNDLE (absolute, or relative to the app's own
 *   working directory), or the committed made-up fixture; Blob is never called.
 *
 * It answers the parsed JSON, unvalidated: `createLibraryV2` validates it.
 */
export const libraryV2BundleSource = ({
  env,
  getBlob = get,
  readText = (file) => readFile(file, "utf-8"),
}: {
  env: BundleV2SourceEnv;
  getBlob?: BlobGet;
  readText?: (file: string) => Promise<string>;
}): BundleSource => {
  if (env.VERCEL_ENV === "production") {
    const name = `Vercel Blob ${LIBRARY_V2_BLOB}`;

    return {
      load: async () => {
        if (!env.BLOB_STORE_ID) {
          throw new Error(
            `${name}: no Blob store: BLOB_STORE_ID is unset (connect the store to the project's Production environment)`
          );
        }

        const blob = await getBlob(LIBRARY_V2_BLOB, {
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

  if (env.LIBRARY_V2_BUNDLE) {
    // Absolute, or relative to the app's own working directory: never a path
    // built from a fixed directory, which Vercel's file tracer would follow
    // (see `libraryBundleSource`).
    const name = path.resolve(env.LIBRARY_V2_BUNDLE);

    return {
      load: async () => parseJson(name, await readText(name)),
      name,
    };
  }

  return {
    load: () => Promise.resolve(fixture),
    name: "the committed fixture (packages/library-bundle/fixtures/library-v2.json)",
  };
};
