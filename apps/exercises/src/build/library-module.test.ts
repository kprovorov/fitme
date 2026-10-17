import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeOid, libraryBundle, libraryExercise } from "../test/fixtures";
import { generateLibraryModule } from "./library-module";

const SUPABASE_URL = "https://project.supabase.co";
const FIXTURE_BUNDLE = resolve(import.meta.dirname, "../../fixtures/library.json");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "exercise-library-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

/** Writes a fixture bundle (JSON-encoded unless it's a string) and returns its path. */
const writeBundle = async (bundle: unknown) => {
  const file = join(dir, "library.json");
  await writeFile(
    file,
    typeof bundle === "string" ? bundle : JSON.stringify(bundle)
  );
  return file;
};

/** Writes the generated module next to the fixture and imports it, as the API does. */
const importModule = async (source: string) => {
  const file = join(dir, "library.ts");
  await writeFile(file, source);
  return import(pathToFileURL(file).href);
};

const valid = libraryBundle([libraryExercise("squat", "Squat")]);

/** A version 1 bundle whose Exercises can be anything, to break the format. */
const bundleOf = (exercises: unknown[]) => ({ exercises, version: 1 });

describe("generateLibraryModule", () => {
  it("generates a module holding every Exercise with its media URLs and the search index", async () => {
    const result = await generateLibraryModule({
      bundlePath: await writeBundle(valid),
      supabaseUrl: `${SUPABASE_URL}/`,
    });

    expect(result.ok).toBe(true);
    const { library } = await importModule(result.ok ? result.source : "");
    expect(library).toEqual({
      exercises: [
        {
          description: "Squat is a compound pushing movement.\n",
          instructions: "1. Lie on the bench.\n2. Press.\n",
          muscle_groups: ["chest", "triceps"],
          name: "Squat",
          slug: "squat",
          thumbnail_url: `${SUPABASE_URL}/storage/v1/render/image/public/exercise-media/squat/${fakeOid("a")}.png`,
          video_url: `${SUPABASE_URL}/storage/v1/object/public/exercise-media/squat/${fakeOid("b")}.mp4`,
        },
      ],
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      searchNames: ["squat"],
    });
  });

  it("accepts the committed fixture bundle", async () => {
    const result = await generateLibraryModule({
      bundlePath: FIXTURE_BUNDLE,
      supabaseUrl: SUPABASE_URL,
    });

    expect(result.ok).toBe(true);
    const { library } = await importModule(result.ok ? result.source : "");
    expect(
      library.exercises.map(({ slug }: { slug: string }) => slug)
    ).toEqual(["example-press", "example-row", "example-squat"]);
  });

  it.each([
    [
      "an unknown muscle group",
      bundleOf([
        { ...libraryExercise("squat", "Squat"), muscle_groups: ["neck"] },
      ]),
      /: exercises\.0\.muscle_groups\.0: unknown muscle group "neck" \(known: chest, /,
    ],
    [
      "a wrong version",
      { ...valid, version: 2 },
      /: version: unsupported bundle version 2 \(this build reads version 1\)$/,
    ],
    [
      "an invalid slug",
      libraryBundle([libraryExercise("Bench_Press", "Bench Press")]),
      /: exercises\.0\.slug: must be an Exercise slug/,
    ],
    [
      "a repeated slug",
      libraryBundle([
        libraryExercise("squat", "Squat"),
        libraryExercise("squat", "Back Squat"),
      ]),
      /: exercises\.1\.slug: Exercise slug "squat" repeats$/,
    ],
    [
      "an unsupported media extension",
      bundleOf([
        {
          ...libraryExercise("squat", "Squat"),
          video: { extension: "mov", oid: fakeOid("b") },
        },
      ]),
      /: exercises\.0\.video\.extension: /,
    ],
    [
      "a field the format doesn't have",
      bundleOf([{ ...libraryExercise("squat", "Squat"), url: "x" }]),
      /: exercises\.0: Unrecognized key: "url"$/,
    ],
  ])("fails on %s, naming the field", async (_, bundle, problem) => {
    const bundlePath = await writeBundle(bundle);

    const result = await generateLibraryModule({
      bundlePath,
      supabaseUrl: SUPABASE_URL,
    });

    expect(result).toEqual({ ok: false, problems: [expect.any(String)] });
    const [message] = result.ok ? [] : result.problems;
    expect(message?.startsWith(`${bundlePath}: `)).toBe(true);
    expect(message).toMatch(problem);
  });

  it("names every problem", async () => {
    const result = await generateLibraryModule({
      bundlePath: await writeBundle({
        exercises: [{ ...libraryExercise("squat", ""), muscle_groups: [] }],
        version: 0,
      }),
      supabaseUrl: SUPABASE_URL,
    });

    expect(result.ok ? [] : result.problems).toHaveLength(3);
  });

  it("fails on a bundle that isn't JSON", async () => {
    const bundlePath = await writeBundle("{ not json");

    const result = await generateLibraryModule({
      bundlePath,
      supabaseUrl: SUPABASE_URL,
    });

    expect(result).toEqual({
      ok: false,
      problems: [expect.stringMatching(/: not valid JSON \(/)],
    });
  });

  it("fails on a missing bundle", async () => {
    const result = await generateLibraryModule({
      bundlePath: join(dir, "nope.json"),
      supabaseUrl: SUPABASE_URL,
    });

    expect(result).toEqual({
      ok: false,
      problems: [
        expect.stringMatching(/nope\.json: can't read the bundle \(ENOENT\)$/),
      ],
    });
  });

  it.each([
    ["missing", undefined],
    ["not a URL", "project.supabase.co"],
    ["not https", "http://project.supabase.co"],
    ["not an origin (path)", "https://project.supabase.co/rest"],
    ["not an origin (query)", "https://project.supabase.co?x=1"],
    ["not an origin (fragment)", "https://project.supabase.co#x"],
    ["not an origin (credentials)", "https://user:pass@project.supabase.co"],
  ])("fails when the Supabase URL is %s", async (_, supabaseUrl) => {
    const result = await generateLibraryModule({
      bundlePath: await writeBundle(valid),
      supabaseUrl,
    });

    expect(result).toEqual({
      ok: false,
      problems: [
        expect.stringMatching(/^SUPABASE_URL: must be the https URL/),
      ],
    });
  });
});
