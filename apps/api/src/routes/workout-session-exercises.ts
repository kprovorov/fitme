import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import { checkExerciseSlugs, slugRefusal } from "../library.js";
import {
  ExerciseSlug,
  errorResponse,
  Id,
  invalidRequest,
  invalidRequestResponse,
  LoggedSet,
  rateLimitedResponse,
  sessionFinished,
  sessionFinishedResponse,
  timestamp,
  unauthorizedResponse,
  WeightUnit,
  WorkoutSessionExerciseResponse,
  WorkoutSessionSetResponse,
} from "../schemas.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const exerciseNotFound = {
  error: { code: "not_found", message: "Workout Session Exercise not found" },
} as const;

/** One logged set of an Exercise history entry, with the targets it was given. */
const ExerciseHistorySet = z
  .object({
    id: Id,
    order: z.int().openapi({ example: 1 }),
    reps_completed: z.int().openapi({
      description: "Repetitions done; every set here has them logged",
      example: 8,
    }),
    reps_recommended: z.int().nullable().openapi({
      description: "The target, `null` for a set added during the session",
      example: 8,
    }),
    weight_completed: z.number().nullable().openapi({
      description:
        "In `weight_unit`, `null` for a bodyweight set, which logs no weight",
      example: 80.5,
    }),
    weight_recommended: z.number().nullable().openapi({
      description: "The target, in `weight_unit`",
      example: 80,
    }),
  })
  .openapi("ExerciseHistorySet");

// The Workout Session is inline rather than a named component: its timestamps
// come straight from the Workout Session it belongs to.
const ExerciseHistoryEntry = z
  .object({
    id: Id.openapi({ description: "The Workout Session Exercise's id" }),
    session: z.object({
      finished_at: timestamp(
        "When the Workout Session was finished"
      ).nullable(),
      id: Id,
      started_at: timestamp("When the Workout Session was started"),
    }),
    sets: z
      .array(ExerciseHistorySet)
      .openapi({ description: "Its logged sets, in order" }),
  })
  .openapi("ExerciseHistoryEntry", {
    description:
      "One time the Exercise appeared in one of the User's Workout Sessions (normally once per Workout Session; twice when it was added to the same one again)",
  });

const ExerciseHistoryPage = z
  .object({
    data: z.array(ExerciseHistoryEntry).openapi({
      description: "The page, newest Workout Session first",
    }),
    hasMore: z
      .boolean()
      .openapi({ description: "Whether more entries follow" }),
    total: z.int().openapi({
      description: "How many entries match, across every page",
    }),
    weight_unit: WeightUnit,
  })
  .openapi("ExerciseHistoryPage");

const listExerciseHistoryRoute = createRoute({
  description:
    "A page of the User's history for one Exercise: every time it appeared in one of their Workout Sessions, newest Workout Session first (by the Workout Session's `started_at`; an Exercise added to the same Workout Session twice keeps its place in it). A set counts once its reps are logged, and a bodyweight set, which logs no weight (`weight_completed` is `null`), counts too; a set that was never logged is left out, and an entry left with no set is left out of the page and of `total`. Weights are as stored, in `weight_unit`. An Exercise the User never did, an Exercise slug the Library doesn't have, and an offset past the end each answer an empty page.",
  method: "get",
  middleware: [requires("read")] as const,
  path: "/",
  request: {
    query: z.object({
      exercise_slug: ExerciseSlug.openapi({
        description:
          "The Exercise, by its Exercise slug from the Library API; one the Library doesn't have answers an empty page",
        example: "barbell-back-squat",
      }),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .default(DEFAULT_LIMIT)
        .openapi({ description: "Page size", example: DEFAULT_LIMIT }),
      offset: z.coerce
        .number()
        .int()
        .min(0)
        .default(0)
        // coercion turns null into 0, which the generator reads as nullable:
        // a query parameter is never null, so the type is given explicitly
        .openapi({
          description: "How many entries to skip",
          example: 0,
          minimum: 0,
          type: "integer",
        }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExerciseHistoryPage } },
      description:
        "A page of the User's history for the Exercise; an offset past the end is an empty page",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "List the User's history for one Exercise",
});

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
    "Replaces the Exercise of a Workout Session Exercise of an open Workout Session, in one transaction: it keeps its id, its place and its sets with their logged results, and every set's targets (`reps_recommended`, `weight_recommended`) become 0. The Exercise slug is checked against the Library first. A finished Workout Session can't change.",
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
      "`invalid_request`: the id isn't a uuid or the body isn't valid; `unknown_exercises`: the Library has no Exercise for the slug the message names. Nothing was changed"
    ),
    401: unauthorizedResponse,
    404: errorResponse(
      "`not_found`: the User has no Workout Session Exercise with this id"
    ),
    409: sessionFinishedResponse,
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
    503: errorResponse(
      "`library_unavailable`: the Exercise slug couldn't be checked; nothing was changed, try again"
    ),
  },
  security: bearerSecurity,
  summary: "Replace an Exercise in a Workout Session",
});

const addSetRoute = createRoute({
  description:
    "Adds a set after the last one of a Workout Session Exercise of an open Workout Session, logged with the reps and weight done and when (`logged_at`, now). The set has no targets (`reps_recommended`, `weight_recommended` and `rest_recommended` are `null`). A finished Workout Session can't change. Not idempotent: a retry adds another set.",
  method: "post",
  middleware: [requires("write")] as const,
  path: "/{id}/sets",
  request: {
    body: {
      content: { "application/json": { schema: LoggedSet } },
      required: true,
    },
    params: z.object({ id: Id }),
  },
  responses: {
    201: {
      content: { "application/json": { schema: WorkoutSessionSetResponse } },
      description: "The added set",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: errorResponse(
      "`not_found`: the User has no Workout Session Exercise with this id"
    ),
    409: sessionFinishedResponse,
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Add a set to a Workout Session Exercise",
});

export const workoutSessionExercises = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(listExerciseHistoryRoute, async (c) => {
    const { exercise_slug, limit, offset } = c.req.valid("query");
    const {
      value: { entries, total },
      weightUnit,
    } = await c.var.getServices().getExerciseHistory({
      exerciseSlug: exercise_slug,
      limit,
      offset,
    });
    // Parsed through the contract, so fields beyond it never go out.
    return c.json(
      ExerciseHistoryPage.parse({
        data: entries.map((entry) => ({
          id: entry.session_exercise_id,
          session: {
            finished_at: entry.finished_at,
            id: entry.session_id,
            started_at: entry.started_at,
          },
          sets: entry.sets,
        })),
        hasMore: offset + entries.length < total,
        total,
        weight_unit: weightUnit,
      }),
      200
    );
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
      return c.json(exerciseNotFound, 404);
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
  })
  .openapi(addSetRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { reps_completed, weight_completed } = c.req.valid("json");
    const { value, weightUnit } = await c.var
      .getServices()
      .addSetToWorkoutSessionExercise({
        repsCompleted: reps_completed,
        sessionExerciseId: id,
        weightCompleted: weight_completed,
      });
    if (value.status === "not_found") {
      return c.json(exerciseNotFound, 404);
    }
    if (value.status === "session_finished") {
      return c.json(sessionFinished(value.sessionId, value.finishedAt), 409);
    }
    return c.json(
      WorkoutSessionSetResponse.parse({
        data: { ...value.set, weight_unit: weightUnit },
      }),
      201
    );
  });
