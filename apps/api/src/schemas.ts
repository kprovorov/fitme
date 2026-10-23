import { muscleGroups } from "@fitme/core";
import { type Hook, z } from "@hono/zod-openapi";
import type { Env } from "hono";

/** The muscle group enum, one named schema wherever it appears. */
export const MuscleGroup = z.enum(muscleGroups).openapi("MuscleGroup");

/**
 * A row id: any 8-4-4-4-12 hex uuid, as Postgres accepts (zod's `uuid` also
 * checks the RFC version and variant, which not every stored id has).
 */
export const Id = z.guid().openapi({
  example: "6f1c0c9e-2b7a-4c1e-9a55-3c2d1e0f4a11",
  format: "uuid",
});

/**
 * The unit every weight in a response is in: the User's, `kg` without a
 * Profile. Weights are returned as stored, never converted.
 */
export const WeightUnit = z.enum(["kg", "lbs"]).openapi("WeightUnit", {
  description:
    "The unit of every weight in the response: the User's measurement system's (`kg` metric, `lbs` us and uk), `kg` without a Profile",
});

/** Every error, whatever the route: `{ error: { code, message } }`. */
export const ErrorResponse = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "not_found" }),
      message: z.string(),
    }),
  })
  .openapi("Error");

/** How long clients and the CDN may reuse a public response, in seconds. */
const PUBLIC_MAX_AGE_SECONDS = 300;

/** The `Cache-Control` of a response anyone may cache for a few minutes. */
export const PUBLIC_CACHE_CONTROL = `public, max-age=${PUBLIC_MAX_AGE_SECONDS}, s-maxage=${PUBLIC_MAX_AGE_SECONDS}`;

/** The headers of such a response, as documented. */
export const publicCacheHeaders = z.object({
  "Cache-Control": z.string().openapi({ example: PUBLIC_CACHE_CONTROL }),
});

/**
 * The default validation hook: a request that fails its schema answers 400
 * `invalid_request` in the error shape, naming each invalid field.
 */
export const invalidRequest = <E extends Env>(
  ...[result, c]: Parameters<Hook<unknown, E, string, unknown>>
) => {
  if (!result.success) {
    const message = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return c.json({ error: { code: "invalid_request", message } }, 400);
  }
};

/** Every User-data route answers 401 without a valid caller (`requireCaller`). */
export const unauthorizedResponse = {
  content: { "application/json": { schema: ErrorResponse } },
  description: "No valid Clerk session token",
};

/** A route with input answers 400 `invalid_request` when it fails its schema. */
export const invalidRequestResponse = {
  content: { "application/json": { schema: ErrorResponse } },
  description: "`invalid_request`: the input fails its schema",
};
