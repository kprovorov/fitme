import { createRoute, z } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { createApp } from "../create-app.js";

const reported: unknown[] = [];

const app = createApp({
  reportError: (error) => {
    reported.push(error);
    return Promise.resolve();
  },
});

// A route with a query schema, added after the app is built like any route
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
    const response = await app.request("/test/paged?limit=0");

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
    const response = await app.request("/test/paged?limit=20");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { limit: 20 } });
  });
});
