import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateLibraryModule } from "./build/library-module";
import { PLACEHOLDER_SUPABASE_URL } from "./served-library";

const APP_ROOT = resolve(import.meta.dirname, "..");

/**
 * Generates src/generated/library.ts, the Exercise Library the API serves,
 * from the library.json bundle at LIBRARY_BUNDLE (absolute, or relative to
 * apps/exercises; by default the committed fixture of made-up Exercises) and
 * the Supabase project at SUPABASE_URL. Runs before every build, dev server,
 * typecheck and test run; fails (exit code 1) on an invalid bundle.
 */
const out = resolve(import.meta.dirname, "generated/library.ts");
const bundlePath = resolve(
  APP_ROOT,
  process.env.LIBRARY_BUNDLE || "fixtures/library.json"
);
// Required on Vercel, where the media URLs are served for real. Anywhere
// else (local runs, CI, tests) a placeholder project will do.
const supabaseUrl =
  process.env.SUPABASE_URL ||
  (process.env.VERCEL ? undefined : PLACEHOLDER_SUPABASE_URL);

const result = await generateLibraryModule({ bundlePath, supabaseUrl });

if (result.ok) {
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, result.source);
  console.log(`generated ${out} from ${bundlePath} (media on ${supabaseUrl})`);
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
