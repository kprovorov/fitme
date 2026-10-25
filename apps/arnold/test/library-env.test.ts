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

    const failure = await getLibrary()
      .lookup(["bench-press"])
      .catch((error: unknown) => error);
    // by shape: the fresh module graph has its own copy of the error classes
    expect(failure).toMatchObject({
      code: "unavailable",
      name: "LibraryUnavailableError",
    });
    expect((failure as Error).cause).toEqual(
      new Error("LIBRARY_URL is not set")
    );
  });

  it("calls LIBRARY_URL with LIBRARY_ARNOLD_SECRET as the bearer", async () => {
    vi.stubEnv("LIBRARY_URL", "https://library.test");
    vi.stubEnv("LIBRARY_ARNOLD_SECRET", "arnold-secret");
    const fetch = vi.fn(async () =>
      Response.json({ data: [], missing: ["bench-press"] })
    );
    vi.stubGlobal("fetch", fetch);
    const getLibrary = await freshGetLibrary();

    await expect(getLibrary().lookup(["bench-press"])).resolves.toEqual({
      data: [],
      missing: ["bench-press"],
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://library.test/exercises?slugs=bench-press");
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer arnold-secret"
    );
  });
});
