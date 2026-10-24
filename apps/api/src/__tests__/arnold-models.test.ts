import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import { describe, expect, it } from "vitest";
import { createApp } from "../create-app.js";

const app = createApp();

const getModels = async (path: string) => {
  const response = await app.request(path);
  return { body: await response.json(), response };
};

// `/v1/coach/models` is what builds from before the Arnold rename read; it
// answers exactly like the new route until they're cut off.
describe.each(["/v1/arnold/models", "/v1/coach/models"])("GET %s", (path) => {
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

describe("the OpenAPI document", () => {
  const { paths } = app.getOpenAPIDocument({
    info: { title: "Fitme API", version: "1.0.0" },
    openapi: "3.0.3",
  });

  it("marks only the Coach route deprecated", () => {
    expect(paths?.["/v1/coach/models"]?.get?.deprecated).toBe(true);
    expect(paths?.["/v1/arnold/models"]?.get?.deprecated).toBeUndefined();
  });
});
