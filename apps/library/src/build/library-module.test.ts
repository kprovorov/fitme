import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fakeOid,
  inUkrainian,
  libraryBundle,
  libraryExercise,
} from "../test/fixtures";
import {
  type BlobGet,
  generateLibraryModule,
  type LibraryEnv,
} from "./library-module";

const SUPABASE_URL = "https://project.supabase.co";
const APP_ROOT = resolve(import.meta.dirname, "../..");

/** Blob outside production: any read fails the test. */
const noBlob: BlobGet = () => {
  throw new Error("read Blob outside production");
};

/** Runs the bundle step as `pnpm generate` does, with `env` and a fake Blob `get`. */
const generate = (env: LibraryEnv, getBlob: BlobGet = noBlob) =>
  generateLibraryModule({ appRoot: APP_ROOT, env, getBlob });

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

/** A fake Blob `get` answering `library.json` with `bundle`, recording its calls. */
const blobHolding = (bundle: unknown) => {
  const calls: Parameters<BlobGet>[] = [];
  const getBlob: BlobGet = (...args) => {
    calls.push(args);
    const body = typeof bundle === "string" ? bundle : JSON.stringify(bundle);
    return Promise.resolve({
      statusCode: 200,
      stream: new Response(body).body as ReadableStream<Uint8Array>,
    });
  };
  return { calls, getBlob };
};

const PRODUCTION: LibraryEnv = {
  BLOB_STORE_ID: "store_test",
  SUPABASE_URL,
  VERCEL: "1",
  VERCEL_ENV: "production",
};

/** A version 1 bundle whose Exercises can be anything, to break the format. */
const bundleOf = (exercises: unknown[]) => ({ exercises, version: 1 });

describe("generateLibraryModule", () => {
  it("generates a module holding every Exercise with its media URLs and the search index", async () => {
    const result = await generate({
      LIBRARY_BUNDLE: await writeBundle(valid),
      SUPABASE_URL: `${SUPABASE_URL}/`,
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
      translations: { uk: {} },
    });
  });

  it("keeps the Ukrainian content of the Exercises that have it", async () => {
    const result = await generate({
      LIBRARY_BUNDLE: await writeBundle(
        libraryBundle([
          inUkrainian(libraryExercise("squat", "Squat"), "Присідання"),
          libraryExercise("lunge", "Lunge"),
        ])
      ),
      SUPABASE_URL,
    });

    expect(result.ok).toBe(true);
    const { library } = await importModule(result.ok ? result.source : "");
    expect(library.translations).toEqual({
      uk: {
        squat: {
          description: "Присідання — вигадана вправа для тестів.\n",
          instructions: "1. Ляжте на лаву.\n2. Тисніть.\n",
          name: "Присідання",
        },
      },
    });
    expect(library.exercises.map(({ name }: { name: string }) => name)).toEqual(
      ["Lunge", "Squat"]
    );
  });

  it("changes the library hash when only a translation changes", async () => {
    const hashOf = async (ukrainianName: string) => {
      const result = await generate({
        LIBRARY_BUNDLE: await writeBundle(
          libraryBundle([
            inUkrainian(libraryExercise("squat", "Squat"), ukrainianName),
          ])
        ),
        SUPABASE_URL,
      });
      return result.ok ? result.hash : "";
    };

    expect(await hashOf("Присідання")).not.toBe(await hashOf("Присід"));
  });

  it("accepts the committed fixture bundle", async () => {
    const result = await generate({ SUPABASE_URL });

    expect(result.ok).toBe(true);
    const { library } = await importModule(result.ok ? result.source : "");
    expect(
      library.exercises.map(({ slug }: { slug: string }) => slug)
    ).toEqual(["example-press", "example-row", "example-squat"]);
    expect(Object.keys(library.translations.uk)).toEqual([
      "example-press",
      "example-row",
    ]);
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
      "a locale that isn't an App language",
      bundleOf([
        {
          ...libraryExercise("squat", "Squat"),
          locales: {
            ...libraryExercise("squat", "Squat").locales,
            de: libraryExercise("squat", "Kniebeuge").locales.en,
          },
        },
      ]),
      /: exercises\.0\.locales: unknown locale "de" \(known: en, uk\)$/,
    ],
    [
      "a Ukrainian translation missing a field",
      bundleOf([
        {
          ...libraryExercise("squat", "Squat"),
          locales: {
            ...libraryExercise("squat", "Squat").locales,
            uk: { description: "", name: "Присідання" },
          },
        },
      ]),
      /: exercises\.0\.locales\.uk\.instructions: /,
    ],
    [
      "a Ukrainian translation with a field the format doesn't have",
      bundleOf([
        {
          ...inUkrainian(libraryExercise("squat", "Squat"), "Присідання"),
          locales: {
            ...libraryExercise("squat", "Squat").locales,
            uk: {
              ...inUkrainian(libraryExercise("squat", "Squat"), "Присідання")
                .locales.uk,
              summary: "x",
            },
          },
        },
      ]),
      /: exercises\.0\.locales\.uk: Unrecognized key: "summary"$/,
    ],
    [
      "a Ukrainian translation with an empty name",
      bundleOf([inUkrainian(libraryExercise("squat", "Squat"), " ")]),
      /: exercises\.0\.locales\.uk\.name: /,
    ],
    [
      "a field the format doesn't have",
      bundleOf([{ ...libraryExercise("squat", "Squat"), url: "x" }]),
      /: exercises\.0: Unrecognized key: "url"$/,
    ],
  ])("fails on %s, naming the field", async (_, bundle, problem) => {
    const bundlePath = await writeBundle(bundle);

    const result = await generate({ LIBRARY_BUNDLE: bundlePath, SUPABASE_URL });

    expect(result).toEqual({ ok: false, problems: [expect.any(String)] });
    const [message] = result.ok ? [] : result.problems;
    expect(message?.startsWith(`${bundlePath}: `)).toBe(true);
    expect(message).toMatch(problem);
  });

  it("names every problem", async () => {
    const result = await generate({
      LIBRARY_BUNDLE: await writeBundle({
        exercises: [{ ...libraryExercise("squat", ""), muscle_groups: [] }],
        version: 0,
      }),
      SUPABASE_URL,
    });

    expect(result.ok ? [] : result.problems).toHaveLength(3);
  });

  it("fails on a bundle that isn't JSON", async () => {
    const bundlePath = await writeBundle("{ not json");

    const result = await generate({ LIBRARY_BUNDLE: bundlePath, SUPABASE_URL });

    expect(result).toEqual({
      ok: false,
      problems: [expect.stringMatching(/: not valid JSON \(/)],
    });
  });

  it("fails on a missing bundle", async () => {
    const result = await generate({
      LIBRARY_BUNDLE: join(dir, "nope.json"),
      SUPABASE_URL,
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
    const result = await generate({
      LIBRARY_BUNDLE: await writeBundle(valid),
      SUPABASE_URL: supabaseUrl,
      VERCEL: "1",
    });

    expect(result).toEqual({
      ok: false,
      problems: [
        expect.stringMatching(/^SUPABASE_URL: must be the https URL/),
      ],
    });
  });
});

describe("generateLibraryModule in production", () => {
  it("builds from the latest library.json in the private Blob store", async () => {
    const blob = blobHolding(libraryBundle([libraryExercise("lunge", "Lunge")]));

    const result = await generate(PRODUCTION, blob.getBlob);

    expect(blob.calls).toEqual([
      ["library.json", { access: "private", useCache: false }],
    ]);
    expect(result).toMatchObject({
      bundle: "Vercel Blob library.json",
      exercises: 1,
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      ok: true,
    });
    const { library } = await importModule(result.ok ? result.source : "");
    expect(library.exercises.map(({ slug }: { slug: string }) => slug)).toEqual(
      ["lunge"]
    );
    expect(result.ok && result.hash).toBe(library.hash);
  });

  it("ignores LIBRARY_BUNDLE", async () => {
    const blob = blobHolding(libraryBundle([libraryExercise("lunge", "Lunge")]));

    const result = await generate(
      { ...PRODUCTION, LIBRARY_BUNDLE: await writeBundle(valid) },
      blob.getBlob
    );

    expect(result).toMatchObject({ exercises: 1, ok: true });
    expect(blob.calls).toHaveLength(1);
  });

  it("fails without a Blob store, never falling back to the fixture", async () => {
    const blob = blobHolding(valid);

    const result = await generate(
      { ...PRODUCTION, BLOB_STORE_ID: undefined },
      blob.getBlob
    );

    expect(blob.calls).toEqual([]);
    expect(result).toEqual({
      ok: false,
      problems: [
        expect.stringMatching(/^Vercel Blob library\.json: no Blob store: /),
      ],
    });
  });

  it("reads the store with the BLOB_READ_WRITE_TOKEN fallback", async () => {
    const blob = blobHolding(valid);

    const result = await generate(
      { ...PRODUCTION, BLOB_READ_WRITE_TOKEN: "token", BLOB_STORE_ID: undefined },
      blob.getBlob
    );

    expect(result.ok).toBe(true);
    expect(blob.calls).toHaveLength(1);
  });

  it("fails when library.json isn't in the store", async () => {
    const result = await generate(PRODUCTION, () => Promise.resolve(null));

    expect(result).toEqual({
      ok: false,
      problems: ["Vercel Blob library.json: not in the Blob store"],
    });
  });

  it("fails when the fetch fails", async () => {
    const result = await generate(PRODUCTION, () =>
      Promise.reject(new Error("Vercel Blob: Access denied"))
    );

    expect(result).toEqual({
      ok: false,
      problems: [
        "Vercel Blob library.json: can't fetch the bundle (Vercel Blob: Access denied)",
      ],
    });
  });

  it.each([
    ["isn't JSON", "{ not json", /: not valid JSON \(/],
    [
      "is invalid",
      { ...valid, version: 2 },
      /: version: unsupported bundle version 2/,
    ],
  ])("fails when the bundle %s, naming it", async (_, bundle, problem) => {
    const result = await generate(PRODUCTION, blobHolding(bundle).getBlob);

    expect(result).toEqual({
      ok: false,
      problems: [expect.stringMatching(problem)],
    });
    const [message] = result.ok ? [] : result.problems;
    expect(message?.startsWith("Vercel Blob library.json: ")).toBe(true);
  });
});

describe("generateLibraryModule outside production", () => {
  it.each([
    ["off Vercel", { SUPABASE_URL }],
    ["in a Vercel preview build", { ...PRODUCTION, VERCEL_ENV: "preview" }],
  ])("builds from the fixture %s without calling Blob", async (_, env) => {
    const blob = blobHolding(libraryBundle([libraryExercise("lunge", "Lunge")]));

    const result = await generate(env, blob.getBlob);

    expect(blob.calls).toEqual([]);
    expect(result).toMatchObject({
      bundle: resolve(APP_ROOT, "fixtures/library.json"),
      exercises: 3,
      ok: true,
    });
  });
});
