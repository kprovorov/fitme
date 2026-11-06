import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `getLibrary` builds its client once per module instance, so each test
// imports a fresh one after setting the environment.
const freshGetLibrary = async () => {
  vi.resetModules();
  const { getLibrary } = await import("../agent/lib/library");

  return getLibrary;
};

describe("getLibrary", () => {
  beforeEach(() => {
    vi.stubEnv("LIBRARY_URL", "");
    vi.stubEnv("LIBRARY_ARNOLD_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails every call unavailable without LIBRARY_URL", async () => {
    vi.stubEnv("EXERCISES_URL", "https://library.test");
    const getLibrary = await freshGetLibrary();

    // by shape: the fresh module graph has its own copy of the error classes
    await expect(getLibrary().lookup(["bench-press"])).rejects.toMatchObject({
      cause: new Error("LIBRARY_URL is not set"),
      code: "unavailable",
      name: "LibraryUnavailableError",
    });
  });

  it("calls LIBRARY_URL with LIBRARY_ARNOLD_SECRET as the bearer", async () => {
    vi.stubEnv("LIBRARY_URL", "https://library.test");
    vi.stubEnv("LIBRARY_ARNOLD_SECRET", "arnold-secret");

    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ data: [], missing: ["bench-press"] }));

    vi.stubGlobal("fetch", fetch);
    const getLibrary = await freshGetLibrary();

    await expect(getLibrary().lookup(["bench-press"])).resolves.toStrictEqual({
      data: [],
      missing: ["bench-press"],
    });
    const [[url, init]] = fetch.mock.calls;
    expect(url).toBe("https://library.test/exercises?slugs=bench-press");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer arnold-secret"
    );
  });
});
