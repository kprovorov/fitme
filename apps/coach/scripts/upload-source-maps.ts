// Runs after `eve build` (the `build` script): uploads the server bundle's
// source maps (emitted through nitro.config.ts) to the Sentry project
// (SENTRY_ORG / SENTRY_PROJECT) for the release, the commit, as
// @fitme/observability reports it. Without SENTRY_AUTH_TOKEN (local, CI) it
// does nothing and the maps stay. A failed upload (Sentry down, a wrong
// project) is logged and never fails the build.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SentryCli } from "@sentry/cli";

// Vercel's build output when building there, eve's own otherwise.
const OUTPUT_DIRS = [".vercel/output/functions", ".output/server"];

const findMaps = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".map") &&
        !entry.parentPath.includes("node_modules")
    )
    .map((entry) => join(entry.parentPath, entry.name));

const main = () => {
  if (!process.env.SENTRY_AUTH_TOKEN) {
    console.log("No SENTRY_AUTH_TOKEN: skipping the source map upload");
    return;
  }
  const dir = OUTPUT_DIRS.find((candidate) => existsSync(candidate));
  const maps = dir ? findMaps(dir) : [];
  if (!dir || maps.length === 0) {
    console.warn("No source maps in the build output: nothing to upload");
    return;
  }
  const cli = SentryCli.getPath();
  const release = process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    execFileSync(
      cli,
      ["sourcemaps", "inject", "--ignore", "node_modules", dir],
      {
        stdio: "inherit",
      }
    );
    execFileSync(
      cli,
      [
        "sourcemaps",
        "upload",
        "--ignore",
        "node_modules",
        ...(release ? ["--release", release] : []),
        dir,
      ],
      { stdio: "inherit" }
    );
  } catch (error) {
    console.warn(
      "Sentry source map upload failed",
      error instanceof Error ? error.message : error
    );
    return;
  }
  // Uploaded: the maps don't ship with the function.
  for (const map of maps) {
    rmSync(map);
  }
};

main();
