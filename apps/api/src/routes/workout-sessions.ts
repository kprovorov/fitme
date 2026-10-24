import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import {
  ErrorResponse,
  Id,
  invalidRequest,
  invalidRequestResponse,
  unauthorizedResponse,
  WeightUnit,
} from "../schemas.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const timestamp = (description: string) =>
  z.string().openapi({
    description: `${description} (ISO 8601)`,
    example: "2026-10-01T10:00:00.123456+00:00",
    format: "date-time",
  });

const Status = z.enum(["in_progress", "finished"]).openapi({
  description: "`finished` once `finished_at` is set",
});

// The Workout and Plan references are inline rather than named components:
// OpenAPI 3.0 can only mark an inline schema nullable.
const sessionFields = {
  finished_at: timestamp("When it was finished").nullable(),
  id: Id,
  plan: z
    .object({
      id: Id,
      name: z.string().nullable(),
    })
    .nullable()
    .openapi({
      description:
        "The Plan it was started from (shown even once that Plan is deleted), `null` without one",
    }),
  started_at: timestamp("When it was started"),
  status: Status,
  workout: z
    .object({
      id: Id,
      name: z.string(),
    })
    .nullable()
    .openapi({
      description:
        "The Workout it was started from, `null` once that Workout is gone (its Plan's Workouts replaced)",
    }),
};

const WorkoutSessionSummary = z
  .object({
    ...sessionFields,
    exercise_count: z.int().openapi({ example: 5 }),
    logged_set_count: z.int().openapi({
      description: "Sets with a logged result",
      example: 8,
    }),
    set_count: z.int().openapi({ example: 15 }),
  })
  .openapi("WorkoutSessionSummary");

const WorkoutSessionPage = z
  .object({
    data: z.array(WorkoutSessionSummary).openapi({
      description: "The page, newest first",
    }),
    hasMore: z
      .boolean()
      .openapi({ description: "Whether more Workout Sessions follow" }),
    total: z.int().openapi({
      description: "How many Workout Sessions match, across every page",
    }),
  })
  .openapi("WorkoutSessionPage");

const WorkoutSessionSet = z
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

const WorkoutSessionExercise = z
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

const WorkoutSession = z
  .object({
    ...sessionFields,
    exercises: z
      .array(WorkoutSessionExercise)
      .openapi({ description: "In order" }),
    weight_unit: WeightUnit,
  })
  .openapi("WorkoutSession");

const WorkoutSessionResponse = z.object({ data: WorkoutSession });

const listWorkoutSessions = createRoute({
  method: "get",
  middleware: [requires("read")] as const,
  path: "/",
  request: {
    query: z.object({
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
          description: "How many Workout Sessions to skip",
          example: 0,
          minimum: 0,
          type: "integer",
        }),
      status: z
        .enum(["all", "in_progress", "finished"])
        .default("all")
        .openapi({ description: "Which Workout Sessions to list" }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: WorkoutSessionPage } },
      description:
        "A page of the User's Workout Sessions; an offset past the end is an empty page",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
  },
  security: bearerSecurity,
  summary: "List the User's Workout Sessions",
});

const getWorkoutSession = createRoute({
  method: "get",
  middleware: [requires("read")] as const,
  path: "/{id}",
  request: { params: z.object({ id: Id }) },
  responses: {
    200: {
      content: { "application/json": { schema: WorkoutSessionResponse } },
      description: "The Workout Session, its Exercises and sets in order",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "`not_found`: the User has no Workout Session with this id",
    },
  },
  security: bearerSecurity,
  summary: "Get one of the User's Workout Sessions",
});

export const workoutSessions = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(getWorkoutSession, async (c) => {
    const { id } = c.req.valid("param");
    const found = await c.var.getServices().getWorkoutSession(id);
    if (!found) {
      return c.json(
        {
          error: { code: "not_found", message: "Workout Session not found" },
        },
        404
      );
    }
    const { value, weightUnit } = found;
    return c.json(
      WorkoutSessionResponse.parse({
        data: { ...value, weight_unit: weightUnit },
      }),
      200
    );
  })
  .openapi(listWorkoutSessions, async (c) => {
    const options = c.req.valid("query");
    const { sessions, total } = await c.var
      .getServices()
      .listWorkoutSessions(options);
    // Parsed through the contract, so fields beyond it never go out.
    return c.json(
      WorkoutSessionPage.parse({
        data: sessions,
        hasMore: options.offset + sessions.length < total,
        total,
      }),
      200
    );
  });
