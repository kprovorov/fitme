import { type Hook, z } from "@hono/zod-openapi";
import type { Env } from "hono";
import { BEARER_AUTH } from "../auth";
import { ErrorResponse } from "../schemas";

/** Every content route answers 401 without a caller (`requireCaller`). */
export const unauthorized = {
  content: { "application/json": { schema: ErrorResponse } },
  description: "No valid Clerk session token or server secret",
};

/** A User over their limit (`rateLimitUsers`). */
export const rateLimited = {
  content: { "application/json": { schema: ErrorResponse } },
  description: "Too many requests from this User; retry after `Retry-After`",
  headers: z.object({
    "Retry-After": z.string().openapi({
      description: "Seconds until the limit resets",
      example: "30",
    }),
  }),
};

/** A Clerk session token or a server secret, as `Authorization: Bearer`. */
export const security = [{ [BEARER_AUTH]: [] }];

/** Answers a request that fails validation with 400 in the error shape. */
export const invalidRequest: Hook<unknown, Env, string, unknown> = (
  result,
  c
) => {
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return c.json({ error: { code: "invalid_request", message } }, 400);
  }
};
