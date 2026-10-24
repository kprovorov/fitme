import { MAX_REPS, MAX_WEIGHT } from "@fitme/core/limits";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import {
  errorResponse,
  Id,
  invalidRequest,
  invalidRequestResponse,
  rateLimitedResponse,
  unauthorizedResponse,
  WEIGHT_STEP,
  WeightUnit,
} from "../schemas.js";
import { WorkoutSessionSet } from "./workout-sessions.js";

const LoggedSet = z
  .strictObject({
    reps_completed: z.number().int().min(0).max(MAX_REPS).openapi({
      description: "Repetitions done",
      example: 8,
    }),
    weight_completed: z
      .number()
      .min(0)
      .max(MAX_WEIGHT)
      .multipleOf(WEIGHT_STEP)
      .openapi({
        description:
          "In the User's weight unit (`kg` for metric, `lbs` for us and uk), as stored; at most 2 decimals. 0 for bodyweight",
        example: 80.5,
      }),
  })
  .openapi("LogWorkoutSessionSet");

const LoggedSetResponse = z.object({
  data: WorkoutSessionSet.extend({ weight_unit: WeightUnit }),
});

const logSetRoute = createRoute({
  description:
    "Records the reps and weight done for one set of an open Workout Session, and when (`logged_at`, now). Logging the same set again overwrites the earlier result. A finished Workout Session's sets can't change.",
  method: "patch",
  middleware: [requires("write")] as const,
  path: "/{id}",
  request: {
    body: {
      content: { "application/json": { schema: LoggedSet } },
      required: true,
    },
    params: z.object({ id: Id }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: LoggedSetResponse } },
      description: "The logged set",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: errorResponse(
      "`not_found`: no set of the User's Workout Sessions has this id"
    ),
    409: errorResponse(
      "`session_finished`: the set's Workout Session is finished; nothing was written"
    ),
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Log a Workout Session set",
});

export const workoutSessionSets = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
}).openapi(logSetRoute, async (c) => {
  const { id } = c.req.valid("param");
  const { reps_completed, weight_completed } = c.req.valid("json");
  const { value, weightUnit } = await c.var.getServices().logSet({
    repsCompleted: reps_completed,
    setId: id,
    weightCompleted: weight_completed,
  });
  if (value.status === "not_found") {
    return c.json(
      {
        error: { code: "not_found", message: "Workout Session set not found" },
      },
      404
    );
  }
  if (value.status === "session_finished") {
    return c.json(
      {
        error: {
          code: "session_finished",
          message: `Workout Session ${value.sessionId} was finished at ${value.finishedAt}; its sets can no longer be logged`,
        },
      },
      409
    );
  }
  return c.json(
    LoggedSetResponse.parse({
      data: { ...value.set, weight_unit: weightUnit },
    }),
    200
  );
});
