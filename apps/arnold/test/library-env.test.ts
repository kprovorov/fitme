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
