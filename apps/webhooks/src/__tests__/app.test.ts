import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../create-app.js";

const reported: unknown[] = [];

const app = createApp({
  clerk: {
    deleteCoachConversations: () => Promise.reject(new Error("not called")),
    deleteUserData: () => Promise.reject(new Error("not called")),
    signingSecret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  },
  reportError: (error) => {
    reported.push(error);
    return Promise.resolve();
  },
});

// Routes that fail on purpose, added after the app is built like any route
const crash = new Error("boom");
app.get("/test/crash", () => {
  throw crash;
});
app.get("/test/teapot", () => {
  throw new HTTPException(418, { message: "I'm a teapot" });
});

afterEach(() => {
  reported.length = 0;
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

  it("reports an unhandled error and answers a JSON 500", async () => {
    const response = await app.request("/test/crash");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "internal_error", message: "Internal server error" },
    });
    expect(reported).toEqual([crash]);
  });

  it("answers an HTTP error with its status without reporting it", async () => {
    const response = await app.request("/test/teapot");

    expect(response.status).toBe(418);
    expect(await response.json()).toEqual({
      error: { code: "http_error", message: "I'm a teapot" },
    });
    expect(reported).toEqual([]);
  });
});
