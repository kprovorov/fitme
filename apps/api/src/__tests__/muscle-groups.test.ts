import { muscleGroups, muscleGroupToName } from "@fitme/core";
import { describe, expect, it } from "vitest";

import { createApp } from "../create-app.js";

const app = createApp();

const [muscleGroup] = muscleGroups;

describe("gET /v1/muscle-groups/:muscleGroup", () => {
  it("returns a known muscle group", async () => {
    const response = await app.request(`/v1/muscle-groups/${muscleGroup}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: { id: muscleGroup, name: muscleGroupToName(muscleGroup) },
    });
  });

  it("answers an unknown one with the API's error shape", async () => {
    const response = await app.request("/v1/muscle-groups/elbows");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toStrictEqual({
      error: { code: "not_found", message: "Unknown muscle group" },
    });
  });
});
