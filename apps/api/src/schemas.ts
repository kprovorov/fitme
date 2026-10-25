import { muscleGroups } from "@fitme/core";
import {
  MAX_EXERCISE_SLUG_LENGTH,
  MAX_WEIGHT_DECIMALS,
} from "@fitme/core/limits";
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

/** Lowercase letters and digits, words joined by single hyphens (apps/library's rule). */
const EXERCISE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** An Exercise slug a write carries, checked against the Exercise Library before anything is written. */
export const ExerciseSlug = z
  .string()
  .max(MAX_EXERCISE_SLUG_LENGTH)
  .regex(
    EXERCISE_SLUG,
    "must be an Exercise slug: lowercase letters and digits, words joined by single hyphens"
  )
  .openapi({
    description:
      "An Exercise slug from the Exercise Library API; every one is checked before anything is written",
    example: "barbell-back-squat",
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

/** The unit every weight of a User is stored and shown in. */
export const WeightUnit = z.enum(["kg", "lbs"]).openapi("WeightUnit", {
  description:
    "The unit of every weight in the response: `kg` (metric) or `lbs` (us, uk). Weights are as stored, never converted",
});

/** The smallest weight step a write accepts: at most `MAX_WEIGHT_DECIMALS` decimals. */
export const WEIGHT_STEP = 10 ** -MAX_WEIGHT_DECIMALS;

/** An error a route answers on purpose (unreported), in the error shape. */
export const errorResponse = (description: string) => ({
  content: { "application/json": { schema: ErrorResponse } },
  description,
});

/** Every User-data route answers 429 once the User is over their limit (`rateLimitCallers`). */
export const rateLimitedResponse = {
  content: { "application/json": { schema: ErrorResponse } },
  description: "Too many requests from this User; retry after `Retry-After`",
  headers: z.object({
    "Retry-After": z.string().openapi({
      description: "Seconds until the limit resets",
      example: "30",
    }),
  }),
};

/** A timestamp as the services render it. */
export const timestamp = (description: string) =>
  z.string().openapi({
    description: `${description} (ISO 8601)`,
    example: "2026-10-01T10:00:00.123456+00:00",
    format: "date-time",
  });

/** One set of a Workout Session, shared by the Workout Session and set routes. */
export const WorkoutSessionSet = z
  .object({
    id: Id,
    logged_at: timestamp("When its result was logged").nullable(),
    order: z.int().openapi({ example: 1 }),
    reps_completed: z.int().nullable().openapi({ example: 8 }),
    reps_recommended: z.int().nullable().openapi({ example: 8 }),
    rest_recommended: z.int().nullable().openapi({
      description: "Rest after the set, in seconds",
      example: 90,
    }),
    weight_completed: z.number().nullable().openapi({
      description: "In `weight_unit`",
      example: 80.5,
    }),
    weight_recommended: z.number().nullable().openapi({
      description: "In `weight_unit`",
      example: 80,
    }),
  })
  .openapi("WorkoutSessionSet");

export const WorkoutSessionExercise = z
  .object({
    exercise_slug: z.string().openapi({
      description: "The Exercise Library's key for the Exercise",
      example: "barbell-bench-press",
    }),
    id: Id,
    order: z.int().openapi({ example: 1 }),
    sets: z.array(WorkoutSessionSet).openapi({ description: "In order" }),
  })
  .openapi("WorkoutSessionExercise");

/** A Workout Session Exercise a write answers, with the User's weight unit. */
export const WorkoutSessionExerciseResponse = z.object({
  data: WorkoutSessionExercise.extend({ weight_unit: WeightUnit }),
});

/** The 409 of an edit to a finished Workout Session. */
export const sessionFinished = (sessionId: string, finishedAt: string) =>
  ({
    error: {
      code: "session_finished",
      message: `Workout Session ${sessionId} was finished at ${finishedAt}; it can no longer be changed`,
    },
  }) as const;

export const sessionFinishedResponse = errorResponse(
  "`session_finished`: the Workout Session is finished; nothing was written"
);
