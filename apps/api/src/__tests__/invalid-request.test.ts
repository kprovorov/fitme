import { createRoute, z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { signedInAs, testApp } from "../test/harness.js";

const { app, reported } = testApp();

// A route with a query schema, added after the app is built like any route
// (so behind auth)
app.openapi(
  createRoute({
    method: "get",
    path: "/test/paged",
    request: {
      query: z.object({ limit: z.coerce.number().int().min(1).max(50) }),
    },
    responses: { 200: { description: "The page" } },
  }),
  (c) => c.json({ data: { limit: c.req.valid("query").limit } }, 200)
);

describe("invalid input", () => {
  it("answers 400 invalid_request in the error shape, unreported", async () => {
    const response = await app.request("/test/paged?limit=0", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_request",
        message: "limit: Too small: expected number to be >=1",
      },
    });
    expect(reported).toEqual([]);
  });

  it("lets valid input through", async () => {
    const response = await app.request("/test/paged?limit=20", {
      headers: signedInAs("user_alice"),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { limit: 20 } });
  });
});
