import { muscleGroups, muscleGroupToName } from "@fitme/core";
import { describe, expect, it } from "vitest";
import app from "../app.js";

const [muscleGroup] = muscleGroups;

describe("GET /v1/muscle-groups/:muscleGroup", () => {
  it("returns a known muscle group", async () => {
    const response = await app.request(`/v1/muscle-groups/${muscleGroup}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: muscleGroup, name: muscleGroupToName(muscleGroup) },
    });
  });

  it("answers an unknown one with the API's error shape", async () => {
    const response = await app.request("/v1/muscle-groups/elbows");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Unknown muscle group" },
    });
  });
});
