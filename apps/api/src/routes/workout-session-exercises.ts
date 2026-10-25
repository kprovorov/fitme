import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import { checkExerciseSlugs, slugRefusal } from "../library.js";
import {
  ExerciseSlug,
  errorResponse,
  Id,
  invalidRequest,
  invalidRequestResponse,
  rateLimitedResponse,
  sessionFinished,
  sessionFinishedResponse,
  unauthorizedResponse,
  WorkoutSessionExerciseResponse,
} from "../schemas.js";

const removeExerciseRoute = createRoute({
  description:
    "Removes an Exercise, with its sets, from an open Workout Session. The remaining Exercises keep their `order`: the gap records which Exercise was removed. Idempotent: an id the User has no Workout Session Exercise with (already removed, never existed, or another User's, which is left untouched) answers 204 too. A finished Workout Session can't change.",
  method: "delete",
  middleware: [requires("write")] as const,
  path: "/{id}",
  request: { params: z.object({ id: Id }) },
  responses: {
    204: {
      description: "The User has no Workout Session Exercise with this id now",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    409: sessionFinishedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Remove an Exercise from a Workout Session",
});

const replaceExerciseRoute = createRoute({
  description:
    "Replaces the Exercise of a Workout Session Exercise of an open Workout Session, in one transaction: it keeps its id, its place and its sets with their logged results, and every set's targets (`reps_recommended`, `weight_recommended`) become 0. The Exercise slug is checked against the Exercise Library first. A finished Workout Session can't change.",
  method: "put",
  middleware: [requires("write")] as const,
  path: "/{id}",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .strictObject({ exercise_slug: ExerciseSlug })
            .openapi("ReplaceWorkoutSessionExercise"),
        },
      },
      required: true,
    },
    params: z.object({ id: Id }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: WorkoutSessionExerciseResponse },
      },
      description: "The replaced Workout Session Exercise, with its sets",
    },
    400: errorResponse(
      "`invalid_request`: the id isn't a uuid or the body isn't valid; `unknown_exercises`: the Exercise Library has no Exercise for the slug the message names. Nothing was changed"
    ),
    401: unauthorizedResponse,
    404: errorResponse(
      "`not_found`: the User has no Workout Session Exercise with this id"
    ),
    409: sessionFinishedResponse,
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
    503: errorResponse(
      "`exercise_library_unavailable`: the Exercise slug couldn't be checked; nothing was changed, try again"
    ),
  },
  security: bearerSecurity,
  summary: "Replace an Exercise in a Workout Session",
});

export const workoutSessionExercises = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(removeExerciseRoute, async (c) => {
    const result = await c.var
      .getServices()
      .removeExerciseFromWorkoutSession(c.req.valid("param").id);
    if (result.status === "session_finished") {
      return c.json(sessionFinished(result.sessionId, result.finishedAt), 409);
    }
    // Nothing removed reads the same whether it was already removed, never
    // existed or is another User's: each answers 204, so a retried remove
    // succeeds and no id is revealed.
    return c.body(null, 204);
  })
  .openapi(replaceExerciseRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { exercise_slug } = c.req.valid("json");
    const refusal = slugRefusal(
      await checkExerciseSlugs({
        library: c.var.getLibrary(),
        reportError: c.var.reportError,
        slugs: [exercise_slug],
      })
    );
    if (refusal) {
      return c.json(refusal.body, refusal.status);
    }
    const { value, weightUnit } = await c.var
      .getServices()
      .replaceExerciseInWorkoutSession({
        exerciseSlug: exercise_slug,
        sessionExerciseId: id,
      });
    if (value.status === "not_found") {
      return c.json(
        {
          error: {
            code: "not_found",
            message: "Workout Session Exercise not found",
          },
        },
        404
      );
    }
    if (value.status === "session_finished") {
      return c.json(sessionFinished(value.sessionId, value.finishedAt), 409);
    }
    return c.json(
      WorkoutSessionExerciseResponse.parse({
        data: { ...value.exercise, weight_unit: weightUnit },
      }),
      200
    );
  });
