import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../create-app.js";

const app = createApp();

const getClientConfig = async () => {
  const response = await app.request("/v1/client-config");
  return { body: await response.json(), response };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /v1/client-config", () => {
  it("returns the configured minimum app version per platform", async () => {
    vi.stubEnv("MIN_APP_VERSION_IOS", "1.10.0");
    vi.stubEnv("MIN_APP_VERSION_ANDROID", "1.9.3");

    const { body, response } = await getClientConfig();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: { minimumVersion: { android: "1.9.3", ios: "1.10.0" } },
    });
  });

  it("returns no minimum for a platform whose env is unset", async () => {
    vi.stubEnv("MIN_APP_VERSION_IOS", "1.10.0");
    vi.stubEnv("MIN_APP_VERSION_ANDROID", undefined);

    const { body } = await getClientConfig();

    expect(body).toEqual({
      data: { minimumVersion: { android: null, ios: "1.10.0" } },
    });
  });

  it("returns no minimum when env holds something other than x.y.z", async () => {
    vi.stubEnv("MIN_APP_VERSION_IOS", "v1.2");
    vi.stubEnv("MIN_APP_VERSION_ANDROID", "");

    const { body } = await getClientConfig();

    expect(body).toEqual({
      data: { minimumVersion: { android: null, ios: null } },
    });
  });

  it("is publicly cacheable for a few minutes", async () => {
    const { response } = await getClientConfig();

    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=300"
    );
  });
});
