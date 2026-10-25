import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { get } from "@vercel/blob";
import { generateLibraryModule } from "./build/library-module";

const APP_ROOT = resolve(import.meta.dirname, "..");

/**
 * Generates src/generated/library.ts, the Library the API serves,
 * from the bundle `generateLibraryModule` picks (production: the private Blob
 * store; anywhere else: LIBRARY_BUNDLE or the fixture). Runs before every
 * build, dev server, typecheck and test run; fails (exit code 1) on a missing
 * or invalid bundle.
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
  const exercises =
    result.exercises === 1 ? "1 Exercise" : `${result.exercises} Exercises`;
  console.log(
    `generated ${out} from ${result.bundle}: ${exercises}, library hash ${result.hash}`
  );
} else {
  const count = result.problems.length;
  console.error(
    `can't generate the Library: ${count} problem${count === 1 ? "" : "s"}\n`
  );
  for (const problem of result.problems) {
    console.error(`  ${problem}`);
  }
  process.exitCode = 1;
}
