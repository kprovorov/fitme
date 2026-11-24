import { describe, expect, it } from "vitest";

import { createApp } from "../create-app.js";

const app = createApp();

describe("gET /v1/muscle-groups", () => {
  it("lists the Library's muscle groups in order, with their English names", async () => {
    const response = await app.request("/v1/muscle-groups");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: [
        { id: "chest", name: "Chest" },
        { id: "back", name: "Back" },
        { id: "shoulders", name: "Shoulders" },
        { id: "biceps", name: "Biceps" },
        { id: "triceps", name: "Triceps" },
        { id: "forearms", name: "Forearms" },
        { id: "core", name: "Core" },
        { id: "traps", name: "Traps" },
        { id: "lower-back", name: "Lower back" },
        { id: "glutes", name: "Glutes" },
        { id: "quadriceps", name: "Quadriceps" },
        { id: "hamstrings", name: "Hamstrings" },
        { id: "adductors", name: "Adductors" },
        { id: "calves", name: "Calves" },
        { id: "tibialis", name: "Tibialis" },
        { id: "neck", name: "Neck" },
      ],
    });
  });
});

describe("gET /v1/muscle-groups/:muscleGroup", () => {
  it("returns a known muscle group", async () => {
    const response = await app.request("/v1/muscle-groups/tibialis");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      data: { id: "tibialis", name: "Tibialis" },
    });
  });

  it.each(["abs", "obliques", "lats", "cardio", "full-body", "elbows"])(
    "answers %s, a legacy-only or unknown one, with the API's error shape",
    async (muscleGroup) => {
      const response = await app.request(`/v1/muscle-groups/${muscleGroup}`);

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toStrictEqual({
        error: { code: "not_found", message: "Unknown muscle group" },
      });
    }
  );
});
