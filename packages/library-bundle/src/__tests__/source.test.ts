import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readLibraryIndex } from "../library-index";
import { libraryBundleSource } from "../source";
import type { BlobGet } from "../source";

const LIBRARY_APP = fileURLToPath(
  new URL("../../../../apps/library/", import.meta.url)
);

const BUNDLE = {
  exercises: [{ muscle_groups: ["chest"], slug: "bench" }],
  version: 1,
};

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

describe("the bundle source", () => {
  it("reads library.json from Blob in production, uncached", async () => {
    const blob = fakeBlob(JSON.stringify(BUNDLE));

    const source = libraryBundleSource({
      env: { BLOB_STORE_ID: "store_1", VERCEL_ENV: "production" },
      getBlob: blob.getBlob,
      readText: noFiles,
    });

    await expect(source.load()).resolves.toStrictEqual(BUNDLE);
    expect(blob.calls).toStrictEqual([
      ["library.json", { access: "private", useCache: false }],
    ]);
  });

  it("fails in production without a Blob store, never falling back to the fixture", async () => {
    const blob = fakeBlob(JSON.stringify(BUNDLE));

    const source = libraryBundleSource({
      env: {
        LIBRARY_BUNDLE: "fixtures/library.json",
        VERCEL_ENV: "production",
      },
      getBlob: blob.getBlob,
      readText: noFiles,
    });

    await expect(source.load()).rejects.toThrow(/BLOB_STORE_ID is unset/u);
    expect(blob.calls).toHaveLength(0);
  });

  it("fails in production when the blob is missing or isn't JSON", async () => {
    const env = { BLOB_STORE_ID: "store_1", VERCEL_ENV: "production" };

    await expect(
      libraryBundleSource({ env, getBlob: fakeBlob(null).getBlob }).load()
    ).rejects.toThrow(/not in the Blob store/u);
    await expect(
      libraryBundleSource({ env, getBlob: fakeBlob("{").getBlob }).load()
    ).rejects.toThrow(/not valid JSON/u);
  });

  it.each(["preview", "development", undefined])(
    "reads LIBRARY_BUNDLE relative to apps/library outside production (VERCEL_ENV %s), never Blob",
    async (vercelEnv) => {
      const blob = fakeBlob(JSON.stringify(BUNDLE));
      const read: string[] = [];

      const source = libraryBundleSource({
        env: {
          BLOB_STORE_ID: "store_1",
          LIBRARY_BUNDLE: "../../content/library.json",
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
        path.resolve(LIBRARY_APP, "../../content/library.json"),
      ]);
      expect(blob.calls).toHaveLength(0);
    }
  );

  it("reads an absolute LIBRARY_BUNDLE as it is", async () => {
    const read: string[] = [];

    const source = libraryBundleSource({
      env: { LIBRARY_BUNDLE: "/bundles/library.json" },
      readText: (file) => {
        read.push(file);

        return Promise.resolve(JSON.stringify(BUNDLE));
      },
    });

    await source.load();

    expect(read).toStrictEqual(["/bundles/library.json"]);
  });

  it("answers the committed fixture without LIBRARY_BUNDLE, reading no file and never Blob", async () => {
    const blob = fakeBlob(JSON.stringify(BUNDLE));

    const source = libraryBundleSource({
      env: {},
      getBlob: blob.getBlob,
      readText: noFiles,
    });

    const index = readLibraryIndex(await source.load());

    expect(index.exercises.get("example-press")).toStrictEqual([
      "chest",
      "triceps",
    ]);
    expect(blob.calls).toHaveLength(0);
  });
});
