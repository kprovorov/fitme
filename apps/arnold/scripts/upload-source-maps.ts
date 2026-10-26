// Runs after `eve build` (the `build` script): uploads the server bundle's
// source maps (emitted through nitro.config.ts) to the Sentry project
// (SENTRY_ORG / SENTRY_PROJECT) for the release, the commit, as
// @fitme/observability reports it. Without SENTRY_AUTH_TOKEN (local, CI) it
// does nothing and the maps stay. A failed upload (Sentry down, a wrong
// project) is logged and never fails the build.
//
// sentry-cli only sees a staged copy of the scripts that have a map: pointed
// at the build output, it follows Vercel's route functions (symlinks to the
// one function) and warns for every chunk eve compiles without a map
// (FIT-334). It also skips dot directories, so the copy
// stages `.well-known/workflow/v1/flow.func` (eve's workflow function) as
// `well-known/…`.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { SentryCli } from "@sentry/cli";

// Vercel's build output when building there, eve's own otherwise.
const OUTPUT_DIRS = [".vercel/output/functions", ".output/server"];

const SCRIPT = /\.[cm]?js$/;
const LEADING_DOTS = /^\.+/;

/** Runs sentry-cli with these arguments; throws when it fails. */
export type SentryCliRunner = (args: string[]) => void;

/**
 * The scripts under `dir` with a `.map` beside them, relative to `base`.
 * Symlinks aren't followed, so each file is listed once, and node_modules
 * (traced dependencies, never bundled) are skipped.
 */
const findMappedScripts = (dir: string, base = dir): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = new Set(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
  );
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : findMappedScripts(path, base);
    }
    const mapped =
      entry.isFile() &&
      SCRIPT.test(entry.name) &&
      files.has(`${entry.name}.map`);
    return mapped ? [relative(base, path)] : [];
  });
};

/** Where a file of the build output is staged: no segment starts with a dot. */
const stagedPath = (file: string): string =>
  file
    .split(sep)
    .map((segment) => segment.replace(LEADING_DOTS, ""))
    .join(sep);

const copy = (from: string, to: string): void => {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
};

const upload = (
  outputDir: string,
  release: string | undefined,
  sentryCli: SentryCliRunner
): void => {
  const scripts = findMappedScripts(outputDir);
  if (scripts.length === 0) {
    console.warn("No source maps in the build output: nothing to upload");
    return;
  }
  const maps = scripts.map((script) => `${script}.map`);
  const staged = new Set([...scripts, ...maps].map(stagedPath));
  if (staged.size !== scripts.length + maps.length) {
    throw new Error("Two build output files would be staged at the same path");
  }
  const staging = mkdtempSync(join(tmpdir(), "arnold-source-maps-"));
  const inOutput = (file: string) => join(outputDir, file);
  const inStaging = (file: string) => join(staging, stagedPath(file));
  try {
    for (const file of [...scripts, ...maps]) {
      copy(inOutput(file), inStaging(file));
    }
    sentryCli(["sourcemaps", "inject", staging]);
    // The deployed scripts carry the debug ids the uploaded maps are found by.
    for (const script of scripts) {
      copy(inStaging(script), inOutput(script));
    }
    sentryCli([
      "sourcemaps",
      "upload",
      ...(release ? ["--release", release] : []),
      staging,
    ]);
  } finally {
    rmSync(staging, { force: true, recursive: true });
  }
  // Uploaded: the maps don't ship with the function.
  for (const map of maps) {
    rmSync(inOutput(map), { force: true });
  }
};

export const uploadSourceMaps = ({
  env,
  outputDir,
  sentryCli,
}: {
  env: Record<string, string | undefined>;
  outputDir: string | undefined;
  sentryCli: SentryCliRunner;
}) => {
  if (!env.SENTRY_AUTH_TOKEN) {
    console.log("No SENTRY_AUTH_TOKEN: skipping the source map upload");
    return;
  }
  if (!outputDir) {
    console.warn("No source maps in the build output: nothing to upload");
    return;
  }
  try {
    upload(outputDir, env.VERCEL_GIT_COMMIT_SHA, sentryCli);
  } catch (error) {
    console.warn(
      "Sentry source map upload failed",
      error instanceof Error ? error.message : error
    );
  }
};

if (import.meta.main) {
  uploadSourceMaps({
    env: process.env,
    outputDir: OUTPUT_DIRS.find((candidate) => existsSync(candidate)),
    sentryCli: (args) =>
      execFileSync(SentryCli.getPath(), args, { stdio: "inherit" }),
  });
}
