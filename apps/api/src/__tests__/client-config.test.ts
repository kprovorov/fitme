import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../create-app.js";

const app = createApp();

const getClientConfig = async () => {
  const response = await app.request("/v1/client-config");
  return { body: await response.json(), response };
};

beforeEach(() => {
  for (const name of [
    "MIN_APP_VERSION",
    "MIN_APP_VERSION_ANDROID",
    "MIN_APP_VERSION_IOS",
    "MIN_APP_VERSION_WEB",
  ]) {
    vi.stubEnv(name, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /v1/client-config", () => {
  it("returns the configured minimum app version per platform", async () => {
    vi.stubEnv("MIN_APP_VERSION_IOS", "1.10.0");
    vi.stubEnv("MIN_APP_VERSION_ANDROID", "1.9.3");
    vi.stubEnv("MIN_APP_VERSION_WEB", "1.8.0");

    const { body, response } = await getClientConfig();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        minimumVersion: { android: "1.9.3", ios: "1.10.0", web: "1.8.0" },
      },
    });
  });

  it("returns no minimum when no env is set", async () => {
    const { body } = await getClientConfig();

    expect(body).toEqual({
      data: { minimumVersion: { android: null, ios: null, web: null } },
    });
  });

  it("falls back to MIN_APP_VERSION for every platform without its own", async () => {
    vi.stubEnv("MIN_APP_VERSION", "1.7.0");
    vi.stubEnv("MIN_APP_VERSION_IOS", "1.10.0");
    vi.stubEnv("MIN_APP_VERSION_ANDROID", "");

    const { body } = await getClientConfig();

    expect(body).toEqual({
      data: {
        minimumVersion: { android: "1.7.0", ios: "1.10.0", web: "1.7.0" },
      },
    });
  });

  it("returns no minimum when env holds something other than x.y.z", async () => {
    vi.stubEnv("MIN_APP_VERSION", "1.7");
    vi.stubEnv("MIN_APP_VERSION_IOS", "v1.2");

    const { body } = await getClientConfig();

    expect(body).toEqual({
      data: { minimumVersion: { android: null, ios: null, web: null } },
    });
  });

  it("is publicly cacheable for a few minutes", async () => {
    const { response } = await getClientConfig();

    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=300"
    );
  });
});
