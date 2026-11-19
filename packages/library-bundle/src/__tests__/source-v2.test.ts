import path from "node:path";

import { describe, expect, it } from "vitest";

import { LibraryBundleV2 } from "../schema-v2";
import type { BlobGet } from "../source";
import { libraryV2BundleSource } from "../source-v2";

const BUNDLE = { exercises: [], version: 2 };

const streamOf = (text: string) =>
  new Response(text).body as ReadableStream<Uint8Array>;

/** A Blob `get` recording its calls, answering `text` (or no blob). */
const fakeBlob = (text: string | null) => {
  const calls: Parameters<BlobGet>[] = [];

  const getBlob: BlobGet = (...args) => {
    calls.push(args);

    return Promise.resolve(text === null ? null : { stream: streamOf(text) });
  };

  return { calls, getBlob };
};

/** A file reader that must never be called. */
const noFiles = () => Promise.reject(new Error("read a file"));

describe("the v2 bundle source", () => {
  it("reads exercises.json from Blob in production, uncached", async () => {
    const blob = fakeBlob(JSON.stringify(BUNDLE));

    const source = libraryV2BundleSource({
      env: { BLOB_STORE_ID: "store_1", VERCEL_ENV: "production" },
      getBlob: blob.getBlob,
      readText: noFiles,
    });

    await expect(source.load()).resolves.toStrictEqual(BUNDLE);
    expect(blob.calls).toStrictEqual([
      ["exercises.json", { access: "private", useCache: false }],
    ]);
  });

  it("fails in production without a Blob store, never falling back to a file or the fixture", async () => {
    const blob = fakeBlob(JSON.stringify(BUNDLE));

    const source = libraryV2BundleSource({
      env: {
        LIBRARY_V2_BUNDLE: "fixtures/library-v2.json",
        VERCEL_ENV: "production",
      },
      getBlob: blob.getBlob,
      readText: noFiles,
    });

    await expect(source.load()).rejects.toThrow(/BLOB_STORE_ID is unset/u);
    expect(blob.calls).toHaveLength(0);
  });

  it("fails in production when the blob is missing, its fetch fails or it isn't JSON", async () => {
    const env = { BLOB_STORE_ID: "store_1", VERCEL_ENV: "production" };

    await expect(
      libraryV2BundleSource({ env, getBlob: fakeBlob(null).getBlob }).load()
    ).rejects.toThrow(/not in the Blob store/u);
    await expect(
      libraryV2BundleSource({
        env,
        getBlob: () => Promise.reject(new Error("Blob is down")),
      }).load()
    ).rejects.toThrow(/Blob is down/u);
    await expect(
      libraryV2BundleSource({ env, getBlob: fakeBlob("{").getBlob }).load()
    ).rejects.toThrow(/not valid JSON/u);
  });

  it.each(["preview", "development", undefined])(
    "reads LIBRARY_V2_BUNDLE relative to the working directory outside production (VERCEL_ENV %s), never Blob",
    async (vercelEnv) => {
      const blob = fakeBlob(JSON.stringify(BUNDLE));
      const read: string[] = [];

      const source = libraryV2BundleSource({
        env: {
          BLOB_STORE_ID: "store_1",
          LIBRARY_V2_BUNDLE: "../../content/library-v2.json",
          VERCEL_ENV: vercelEnv,
        },
        getBlob: blob.getBlob,
        readText: (file) => {
          read.push(file);

          return Promise.resolve(JSON.stringify(BUNDLE));
        },
      });

      await expect(source.load()).resolves.toStrictEqual(BUNDLE);
      expect(read).toStrictEqual([
        path.resolve("../../content/library-v2.json"),
      ]);
      expect(blob.calls).toHaveLength(0);
    }
  );

  it("reads an absolute LIBRARY_V2_BUNDLE as it is", async () => {
    const read: string[] = [];

    const source = libraryV2BundleSource({
      env: { LIBRARY_V2_BUNDLE: "/bundles/library-v2.json" },
      readText: (file) => {
        read.push(file);

        return Promise.resolve(JSON.stringify(BUNDLE));
      },
    });

    await source.load();

    expect(read).toStrictEqual(["/bundles/library-v2.json"]);
  });

  it("answers the committed fixture without LIBRARY_V2_BUNDLE, reading no file and never Blob", async () => {
    const blob = fakeBlob(JSON.stringify(BUNDLE));

    const source = libraryV2BundleSource({
      env: {},
      getBlob: blob.getBlob,
      readText: noFiles,
    });

    const bundle = LibraryBundleV2.parse(await source.load());

    expect(bundle.exercises.map((exercise) => exercise.slug)).toContain(
      "example-bench-press"
    );
    expect(blob.calls).toHaveLength(0);
  });

  it("never reads the v1 LIBRARY_BUNDLE", async () => {
    const source = libraryV2BundleSource({
      // SAFETY: a v1 variable the v2 env doesn't declare, set as process.env would
      env: { LIBRARY_BUNDLE: "/bundles/library.json" } as never,
      readText: noFiles,
    });

    await expect(source.load()).resolves.toMatchObject({ version: 2 });
  });
});
