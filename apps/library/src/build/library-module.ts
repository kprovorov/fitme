import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GetCommandOptions } from "@vercel/blob";
import { z } from "zod";
import { LibraryBundle } from "../bundle";
import { PLACEHOLDER_SUPABASE_URL, serveLibrary } from "../served-library";

/** The pathname `fitme-exercises` publishes the bundle at in the private Blob store. */
export const LIBRARY_BLOB = "library.json";

/** The bundle a build uses when it isn't a production one and LIBRARY_BUNDLE is unset. */
const FIXTURE_BUNDLE = "fixtures/library.json";

/** The variables the bundle step reads (`process.env` in `pnpm generate`). */
export interface LibraryEnv {
  /** Set by connecting the Blob store; the SDK authenticates through Vercel OIDC with it. */
  BLOB_STORE_ID?: string;
  /** The fallback when OIDC isn't available at build time. */
  BLOB_READ_WRITE_TOKEN?: string;
  LIBRARY_BUNDLE?: string;
  SUPABASE_URL?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
}

/** `get` from `@vercel/blob`, narrowed to what the build reads. */
export type BlobGet = (
  pathname: string,
  options: GetCommandOptions
) => Promise<{ stream: ReadableStream<Uint8Array> | null } | null>;

const URL_PROBLEM =
  "must be the https URL of the Supabase project, e.g. https://<project>.supabase.co";

/**
 * The project's https origin: media URLs are appended to it, so no path,
 * query, fragment or credentials may follow.
 */
const SupabaseUrl = z
  .string({ error: URL_PROBLEM })
  .refine((value) => {
    const url = URL.parse(value);
    return url?.protocol === "https:" && url.href === `${url.origin}/`;
  }, URL_PROBLEM)
  .transform((value) => new URL(value).origin);

/** Why the build can't go on, each problem naming its file (or variable) and field. */
interface Problems {
  ok: false;
  problems: string[];
}

export type GenerateResult =
  | {
      ok: true;
      /** Which bundle the module was built from, for the build log. */
      bundle: string;
      /** How many Exercises it holds. */
      exercises: number;
      /** The library hash (the `ETag`), so a deployment's content can be told apart. */
      hash: string;
      /** The generated module. */
      source: string;
    }
  | Problems;

type TextResult = { ok: true; text: string } | Problems;

type ReadResult = { ok: true; bundle: LibraryBundle } | Problems;

const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const readFileText = async (path: string): Promise<TextResult> => {
  try {
    return { ok: true, text: await readFile(path, "utf8") };
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : String(error);
    return { ok: false, problems: [`${path}: can't read the bundle (${code})`] };
  }
};

/**
 * Fetches the bundle from the private Blob store, uncached so the build gets
 * the version just published. A missing store or blob, or a failed fetch,
 * is a problem: production never falls back to the fixture.
 */
const readBlobText = async (
  name: string,
  env: LibraryEnv,
  getBlob: BlobGet
): Promise<TextResult> => {
  if (!(env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN)) {
    return {
      ok: false,
      problems: [
        `${name}: no Blob store: BLOB_STORE_ID is unset (connect the store to the project's Production environment)`,
      ],
    };
  }
  try {
    const blob = await getBlob(LIBRARY_BLOB, {
      access: "private",
      useCache: false,
    });
    if (!blob?.stream) {
      return { ok: false, problems: [`${name}: not in the Blob store`] };
    }
    return { ok: true, text: await new Response(blob.stream).text() };
  } catch (error) {
    return {
      ok: false,
      problems: [`${name}: can't fetch the bundle (${reasonOf(error)})`],
    };
  }
};

/** Parses and validates a bundle; every problem names it (`name`) and the field. */
const parseBundle = (name: string, text: string): ReadResult => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      problems: [`${name}: not valid JSON (${reasonOf(error)})`],
    };
  }
  const bundle = LibraryBundle.safeParse(json);
  if (!bundle.success) {
    return {
      ok: false,
      problems: bundle.error.issues.map((issue) =>
        issue.path.length > 0
          ? `${name}: ${issue.path.join(".")}: ${issue.message}`
          : `${name}: ${issue.message}`
      ),
    };
  }
  return { bundle: bundle.data, ok: true };
};

/**
 * Reads and validates the `library.json` bundle and turns it into the source
 * of a TypeScript module the API imports: every Exercise in every App
 * language with its media URLs resolved on the Supabase project at
 * SUPABASE_URL, and each language's order and search index. Which bundle:
 *
 * - a production build (`VERCEL_ENV=production`) fetches `library.json` from
 *   the private Blob store through `getBlob`, and fails without it;
 * - any other build reads LIBRARY_BUNDLE (absolute, or relative to
 *   `appRoot`), by default the committed fixture of made-up Exercises, and
 *   never calls Blob.
 *
 * SUPABASE_URL is required on Vercel (`VERCEL` set); anywhere else media URLs
 * point at a placeholder project. An invalid bundle (or URL) gives problems
 * instead, so the build fails.
 */
export const generateLibraryModule = async ({
  appRoot,
  env,
  getBlob,
}: {
  appRoot: string;
  env: LibraryEnv;
  getBlob: BlobGet;
}): Promise<GenerateResult> => {
  const url = SupabaseUrl.safeParse(
    env.SUPABASE_URL || (env.VERCEL ? undefined : PLACEHOLDER_SUPABASE_URL)
  );
  if (!url.success) {
    return {
      ok: false,
      problems: url.error.issues.map(
        (issue) => `SUPABASE_URL: ${issue.message}`
      ),
    };
  }
  let bundleName: string;
  let text: TextResult;
  if (env.VERCEL_ENV === "production") {
    bundleName = `Vercel Blob ${LIBRARY_BLOB}`;
    text = await readBlobText(bundleName, env, getBlob);
  } else {
    bundleName = resolve(appRoot, env.LIBRARY_BUNDLE || FIXTURE_BUNDLE);
    text = await readFileText(bundleName);
  }
  if (!text.ok) {
    return text;
  }
  const result = parseBundle(bundleName, text.text);
  if (!result.ok) {
    return result;
  }

  const library = serveLibrary(result.bundle, url.data);
  const source = `// Generated by \`pnpm generate\` from the library.json bundle: don't edit.
import type { ServedLibrary } from "../served-library";

export const library: ServedLibrary = ${JSON.stringify(library, null, 2)};
`;
  return {
    bundle: bundleName,
    exercises: result.bundle.exercises.length,
    hash: library.hash,
    ok: true,
    source,
  };
};
