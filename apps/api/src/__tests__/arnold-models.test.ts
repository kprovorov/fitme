import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../create-app.js";
import { signedInAs, testApp } from "../test/harness.js";

const app = createApp();

const getModels = async (path: string) => {
  const response = await app.request(path);
  return { body: await response.json(), response };
};

describe("GET /v1/arnold/models", () => {
  const path = "/v1/arnold/models";

  it("answers without a token", async () => {
    const { response } = await getModels(path);

    expect(response.status).toBe(200);
  });

  it("returns every Arnold model in list order and the default id", async () => {
    const { body } = await getModels(path);

    expect(body).toEqual({
      data: {
        defaultId: defaultArnoldModelId,
        models: arnoldModels.map(({ description, id, label }) => ({
          description,
          id,
          label,
        })),
      },
    });
  });

  it("sends only id, label and description per model", async () => {
    const { body } = await getModels(path);

    for (const model of body.data.models) {
      expect(Object.keys(model).sort()).toEqual(["description", "id", "label"]);
    }
  });

  it("is publicly cacheable for a few minutes", async () => {
    const { response } = await getModels(path);

    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=300"
    );
  });
});

// The pre-rename route, removed once the minimum version gate (2.2.0) cut off
// the builds that read it
describe("GET /v1/coach/models", () => {
  it("is gone", async () => {
    const response = await testApp().app.request("/v1/coach/models", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "not_found" },
    });
  });

  it("isn't in the OpenAPI document", () => {
    const { paths } = app.getOpenAPIDocument({
      info: { title: "Fitme API", version: "1.0.0" },
      openapi: "3.0.3",
    });

    expect(paths).not.toHaveProperty("/v1/coach/models");
    expect(paths?.["/v1/arnold/models"]?.get?.deprecated).toBeUndefined();
  });
});
