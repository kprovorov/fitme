import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import {
  errorResponse,
  Id,
  invalidRequest,
  invalidRequestResponse,
  LoggedSet,
  rateLimitedResponse,
  unauthorizedResponse,
  WorkoutSessionSetResponse,
} from "../schemas.js";

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
      content: { "application/json": { schema: WorkoutSessionSetResponse } },
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
    WorkoutSessionSetResponse.parse({
      data: { ...value.set, weight_unit: weightUnit },
    }),
    200
  );
});
