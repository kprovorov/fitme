import { coachModels, defaultCoachModelId } from "@fitme/core";
import { describe, expect, it } from "vitest";
import app from "../app.js";

const getCoachModels = async () => {
  const response = await app.request("/v1/coach/models");
  return { body: await response.json(), response };
};

describe("GET /v1/coach/models", () => {
  it("answers without a token", async () => {
    const { response } = await getCoachModels();

    expect(response.status).toBe(200);
  });

  it("returns every Coach model in list order and the default id", async () => {
    const { body } = await getCoachModels();

    expect(body).toEqual({
      data: {
        defaultId: defaultCoachModelId,
        models: coachModels.map(({ description, id, label }) => ({
          description,
          id,
          label,
        })),
      },
    });
  });

  it("sends only id, label and description per model", async () => {
    const { body } = await getCoachModels();

    for (const model of body.data.models) {
      expect(Object.keys(model).sort()).toEqual(["description", "id", "label"]);
    }
  });

  it("is publicly cacheable for a few minutes", async () => {
    const { response } = await getCoachModels();

    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=300"
    );
  });
});
