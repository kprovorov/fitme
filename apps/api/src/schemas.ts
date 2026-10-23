import { muscleGroups } from "@fitme/core";
import { type Hook, z } from "@hono/zod-openapi";
import type { Env } from "hono";

/** The muscle group enum, one named schema wherever it appears. */
export const MuscleGroup = z.enum(muscleGroups).openapi("MuscleGroup");

/** Every error, whatever the route: `{ error: { code, message } }`. */
export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "not_found" }),
      message: z.string(),
    }),
  })
  .openapi("Error");

/** A response clients and the CDN may reuse for a few minutes. */
export const publicCacheHeaders = z.object({
  "Cache-Control": z.string().openapi({
    example: "public, max-age=300, s-maxage=300",
  }),
});

/**
 * The default validation hook: a request that fails its schema answers 400
 * `invalid_request` in the error shape, naming each invalid field.
 */
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
