import type * as Observability from "@fitme/observability/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

// `getLibrary` builds its Library once per module instance, so each test
// imports a fresh one after setting the environment.
const freshGetLibrary = async () => {
  vi.resetModules();
  const { getLibrary } = await import("../agent/lib/library");

  return getLibrary;
};

describe("getLibrary", () => {
  beforeEach(() => {
    observability.reportError.mockResolvedValue(undefined);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("LIBRARY_V2_BUNDLE", "");
    vi.stubEnv("BLOB_STORE_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves the committed made-up v2 fixture outside production", async () => {
    const getLibrary = await freshGetLibrary();
    const answer = await getLibrary().get();

    expect(answer.status).toBe("ready");
    expect(
      answer.status === "ready" &&
        answer.library.get("example-bench-press", { language: "uk" })?.name
    ).toBe("Приклад жиму лежачи");
  });

  it("keeps one Library for the instance", async () => {
    const getLibrary = await freshGetLibrary();

    expect(getLibrary()).toBe(getLibrary());
  });

  it("answers unavailable, reported, when LIBRARY_V2_BUNDLE can't be read", async () => {
    vi.stubEnv("LIBRARY_V2_BUNDLE", "/nonexistent/library-v2.json");
    const getLibrary = await freshGetLibrary();

    await expect(getLibrary().get()).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(observability.reportError).toHaveBeenCalledWith(expect.any(Error), {
      exercise_library: "library",
    });
  });

  it("never reads LIBRARY_BUNDLE, the Legacy Library's bundle", async () => {
    vi.stubEnv("LIBRARY_BUNDLE", "/nonexistent/library.json");
    const getLibrary = await freshGetLibrary();

    await expect(getLibrary().get()).resolves.toMatchObject({
      status: "ready",
    });
  });
});

// `getLibraryIndex` builds its index once per module instance, as `getLibrary` does.
const freshGetLibraryIndex = async () => {
  vi.resetModules();
  const { getLibraryIndex } = await import("../agent/lib/library-index");

  return getLibraryIndex;
};

describe("getLibraryIndex", () => {
  beforeEach(() => {
    observability.reportError.mockReset();
    observability.reportError.mockResolvedValue(undefined);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("LIBRARY_BUNDLE", "");
    vi.stubEnv("BLOB_STORE_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves the committed fixture's Covers outside production", async () => {
    const getLibraryIndex = await freshGetLibraryIndex();
    const answer = await getLibraryIndex().lookup([]);

    expect(answer.status).toBe("ready");
    expect(answer.status === "ready" && answer.covers.length).toBeGreaterThan(
      0
    );
  });

  it("keeps one index for the instance", async () => {
    const getLibraryIndex = await freshGetLibraryIndex();

    expect(getLibraryIndex()).toBe(getLibraryIndex());
  });

  it("answers unavailable, reported, when LIBRARY_BUNDLE can't be read", async () => {
    vi.stubEnv("LIBRARY_BUNDLE", "/nonexistent/library.json");
    const getLibraryIndex = await freshGetLibraryIndex();

    await expect(getLibraryIndex().lookup([])).resolves.toStrictEqual({
      status: "unavailable",
    });
    expect(observability.reportError).toHaveBeenCalledWith(expect.any(Error), {
      exercise_library: "index",
    });
  });

  it("never reads LIBRARY_V2_BUNDLE, the new Library's bundle", async () => {
    vi.stubEnv("LIBRARY_V2_BUNDLE", "/nonexistent/library-v2.json");
    const getLibraryIndex = await freshGetLibraryIndex();

    await expect(getLibraryIndex().lookup([])).resolves.toMatchObject({
      status: "ready",
    });
  });
});
