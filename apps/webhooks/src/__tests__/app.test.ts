import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

const app = createApp({
  clerk: {
    deleteUserData: () => Promise.reject(new Error("not called")),
    reportError: () => Promise.resolve(),
    signingSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  },
});

describe("app", () => {
  it("answers /health", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("answers an unknown route with a JSON 404", async () => {
    const response = await app.request("/nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Route not found" },
    });
  });

  it("answers GET /clerk with a JSON 404", async () => {
    const response = await app.request("/clerk");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "not_found", message: "Route not found" },
    });
  });
});
