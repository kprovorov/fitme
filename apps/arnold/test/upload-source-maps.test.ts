import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadSourceMaps } from "../scripts/upload-source-maps";

const ENV = {
  SENTRY_AUTH_TOKEN: "sntrys_test",
  VERCEL_GIT_COMMIT_SHA: "abc123",
};
const INJECTED = "//# debugId=test";

let root: string;
let output: string;

const write = (path: string, content = "") => {
  mkdirSync(dirname(join(output, path)), { recursive: true });
  writeFileSync(join(output, path), content);
};

/** Every file under `dir`, relative to it, without following symlinks. */
const filesIn = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(entry.parentPath, entry.name);
    if (entry.isDirectory()) {
      return filesIn(path).map((file) => join(entry.name, file));
    }
    return entry.isFile() ? [relative(dir, path)] : [];
  });

/**
 * A Vercel build output like eve's: one real function with mapped chunks,
 * chunks without a map, traced node_modules, a route function that is a
 * symlink to it, and the workflow function under a dot directory.
 */
const vercelOutput = () => {
  write("__server.func/index.mjs", "index");
  write("__server.func/index.mjs.map", "{}");
  write("__server.func/_libs/@ai-sdk/gateway+[...].mjs", "gateway");
  write("__server.func/_libs/@ai-sdk/gateway+[...].mjs.map", "{}");
  write("__server.func/_libs/_1.mjs", "no map");
  write("__server.func/_runtime.mjs", "no map");
  write("__server.func/node_modules/pkg/index.js", "dependency");
  write("__server.func/node_modules/pkg/index.js.map", "{}");
  write(".well-known/workflow/v1/flow.func/index.mjs", "flow");
  write(".well-known/workflow/v1/flow.func/index.mjs.map", "{}");
  mkdirSync(join(output, "eve/v1"), { recursive: true });
  symlinkSync("../../__server.func", join(output, "eve/v1/health.func"));
};

/** The files sentry-cli walks under `dir`: it skips dot directories. */
const visibleFilesIn = (dir: string): string[] =>
  filesIn(dir).filter(
    (file) => !file.split("/").some((segment) => segment.startsWith("."))
  );

/** Records each sentry-cli call and the files it sees, injects like it. */
const fakeSentryCli = () => {
  const calls: { args: string[]; files: string[] }[] = [];
  const run = vi.fn((args: string[]) => {
    const dir = args.at(-1) as string;
    calls.push({ args, files: visibleFilesIn(dir).sort() });
    if (args[1] === "inject") {
      for (const file of visibleFilesIn(dir).filter((f) =>
        f.endsWith(".mjs")
      )) {
        const path = join(dir, file);
        writeFileSync(path, `${readFileSync(path, "utf8")}\n${INJECTED}`);
      }
    }
  });
  return { calls, run };
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "arnold-source-maps-"));
  output = join(root, "functions");
  mkdirSync(output);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe("uploadSourceMaps", () => {
  it("points sentry-cli only at the files that have a source map, once each, in no dot directory", () => {
    vercelOutput();
    const cli = fakeSentryCli();

    uploadSourceMaps({ env: ENV, outputDir: output, sentryCli: cli.run });

    // sentry-cli skips dot directories
    const mapped = [
      "__server.func/_libs/@ai-sdk/gateway+[...].mjs",
      "__server.func/_libs/@ai-sdk/gateway+[...].mjs.map",
      "__server.func/index.mjs",
      "__server.func/index.mjs.map",
      "well-known/workflow/v1/flow.func/index.mjs",
      "well-known/workflow/v1/flow.func/index.mjs.map",
    ];
    expect(cli.calls.map((call) => call.args.slice(0, 2))).toEqual([
      ["sourcemaps", "inject"],
      ["sourcemaps", "upload"],
    ]);
    expect(cli.calls.map((call) => call.files)).toEqual([mapped, mapped]);
  });

  it("uploads for the release, ships the injected scripts and deletes the maps", () => {
    vercelOutput();
    const cli = fakeSentryCli();

    uploadSourceMaps({ env: ENV, outputDir: output, sentryCli: cli.run });

    const [inject, upload] = cli.calls;
    expect(upload.args).toEqual([
      "sourcemaps",
      "upload",
      "--release",
      "abc123",
      inject.args.at(-1),
    ]);
    expect(existsSync(inject.args.at(-1) as string)).toBe(false);
    expect(readFileSync(join(output, "__server.func/index.mjs"), "utf8")).toBe(
      `index\n${INJECTED}`
    );
    expect(
      readFileSync(
        join(output, ".well-known/workflow/v1/flow.func/index.mjs"),
        "utf8"
      )
    ).toBe(`flow\n${INJECTED}`);
    expect(
      readFileSync(join(output, "__server.func/_libs/_1.mjs"), "utf8")
    ).toBe("no map");
    expect(filesIn(output).sort()).toEqual([
      ".well-known/workflow/v1/flow.func/index.mjs",
      "__server.func/_libs/@ai-sdk/gateway+[...].mjs",
      "__server.func/_libs/_1.mjs",
      "__server.func/_runtime.mjs",
      "__server.func/index.mjs",
      "__server.func/node_modules/pkg/index.js",
      "__server.func/node_modules/pkg/index.js.map",
    ]);
  });

  it("skips without SENTRY_AUTH_TOKEN and keeps the maps", () => {
    vercelOutput();
    const cli = fakeSentryCli();

    uploadSourceMaps({
      env: { VERCEL_GIT_COMMIT_SHA: "abc123" },
      outputDir: output,
      sentryCli: cli.run,
    });

    expect(cli.run).not.toHaveBeenCalled();
    expect(existsSync(join(output, "__server.func/index.mjs.map"))).toBe(true);
  });

  it("never fails the build when the upload fails, and keeps the maps", () => {
    vercelOutput();
    const cli = fakeSentryCli();
    cli.run.mockImplementation((args: string[]) => {
      cli.calls.push({ args, files: [] });
      if (args[1] === "upload") {
        throw new Error("Command failed: sentry-cli sourcemaps upload");
      }
    });

    expect(() =>
      uploadSourceMaps({ env: ENV, outputDir: output, sentryCli: cli.run })
    ).not.toThrow();

    expect(console.warn).toHaveBeenCalledWith(
      "Sentry source map upload failed",
      "Command failed: sentry-cli sourcemaps upload"
    );
    expect(existsSync(join(output, "__server.func/index.mjs.map"))).toBe(true);
    expect(existsSync(cli.calls[0].args.at(-1) as string)).toBe(false);
  });

  it("uploads nothing when the build output has no source maps", () => {
    write("__server.func/index.mjs", "index");
    const cli = fakeSentryCli();

    uploadSourceMaps({ env: ENV, outputDir: output, sentryCli: cli.run });
    uploadSourceMaps({ env: ENV, outputDir: undefined, sentryCli: cli.run });

    expect(cli.run).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      "No source maps in the build output: nothing to upload"
    );
  });
});
