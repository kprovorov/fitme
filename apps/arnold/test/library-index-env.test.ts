import type * as Observability from "@fitme/observability/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const observability = vi.hoisted(() => ({
  reportError: vi.fn<typeof Observability.reportError>(),
}));

vi.mock<typeof Observability>(
  import("@fitme/observability/node"),
  () => observability
);

// `getLibraryIndex` builds its index once per module instance, so each test
// imports a fresh one after setting the environment.
const freshGetLibraryIndex = async () => {
  vi.resetModules();
  const { getLibraryIndex } = await import("../agent/lib/library-index");

  return getLibraryIndex;
};

describe("getLibraryIndex", () => {
  beforeEach(() => {
    observability.reportError.mockResolvedValue(undefined);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("LIBRARY_BUNDLE", "");
    vi.stubEnv("BLOB_STORE_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("checks slugs against the committed fixture outside production", async () => {
    const getLibraryIndex = await freshGetLibraryIndex();

    await expect(
      getLibraryIndex().lookup(["example-press", "made-up-fly"])
    ).resolves.toMatchObject({
      exercises: [{ slug: "example-press" }],
      missing: ["made-up-fly"],
      status: "ready",
    });
  });

  it("keeps one index for the instance", async () => {
    const getLibraryIndex = await freshGetLibraryIndex();

    expect(getLibraryIndex()).toBe(getLibraryIndex());
  });

  it("answers unavailable, reported, when LIBRARY_BUNDLE can't be read", async () => {
    vi.stubEnv("LIBRARY_BUNDLE", "/nonexistent/library.json");
    const getLibraryIndex = await freshGetLibraryIndex();

    await expect(
      getLibraryIndex().lookup(["example-press"])
    ).resolves.toStrictEqual({ status: "unavailable" });
    expect(observability.reportError).toHaveBeenCalledWith(expect.any(Error), {
      exercise_library: "index",
    });
  });
});
