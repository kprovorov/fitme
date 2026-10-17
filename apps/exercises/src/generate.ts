import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { get } from "@vercel/blob";
import { generateLibraryModule } from "./build/library-module";

const APP_ROOT = resolve(import.meta.dirname, "..");

/**
 * Generates src/generated/library.ts, the Exercise Library the API serves.
 * A production build (VERCEL_ENV=production) builds from library.json in the
 * private Blob store, read through Vercel OIDC (BLOB_STORE_ID), or
 * BLOB_READ_WRITE_TOKEN as the fallback; any other build from the bundle at
 * LIBRARY_BUNDLE (by default the committed fixture of made-up Exercises).
 * Media URLs are resolved on the Supabase project at SUPABASE_URL. Runs
 * before every build, dev server, typecheck and test run; fails (exit code 1)
 * on a missing or invalid bundle.
 */
const out = resolve(import.meta.dirname, "generated/library.ts");

const result = await generateLibraryModule({
  appRoot: APP_ROOT,
  env: process.env,
  getBlob: get,
});

if (result.ok) {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, result.source);
  // The build log names the deployment's content: its source, size and hash.
  console.log(
    `generated ${out} from ${result.bundle}: ${result.exercises} Exercise${result.exercises === 1 ? "" : "s"}, library hash ${result.hash}`
  );
} else {
  const count = result.problems.length;
  console.error(
    `can't generate the Exercise Library: ${count} problem${count === 1 ? "" : "s"}\n`
  );
  for (const problem of result.problems) {
    console.error(`  ${problem}`);
  }
  process.exitCode = 1;
}
