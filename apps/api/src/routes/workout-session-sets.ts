import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { bearerSecurity, requires } from "../auth.js";
import type { ApiEnv } from "../auth.js";
import {
  errorResponse,
  Id,
  invalidRequest,
  invalidRequestResponse,
  LoggedSet,
  rateLimitedResponse,
  sessionFinished,
  sessionFinishedResponse,
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

const removeSetRoute = createRoute({
  description:
    "Removes a set, logged or not, from an open Workout Session. The remaining sets keep their `order`: the Plan Update reads the gap as a removal. An Exercise whose last set is removed stays, with no sets. Idempotent: an id the User has no Workout Session set with (already removed, never existed, or another User's, which is left untouched) answers 204 too. A finished Workout Session can't change.",
  method: "delete",
  middleware: [requires("write")] as const,
  path: "/{id}",
  request: { params: z.object({ id: Id }) },
  responses: {
    204: {
      description: "The User has no Workout Session set with this id now",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    409: sessionFinishedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Remove a set from a Workout Session",
});

export const workoutSessionSets = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(logSetRoute, async (c) => {
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
          error: {
            code: "not_found",
            message: "Workout Session set not found",
          },
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
  })
  .openapi(removeSetRoute, async (c) => {
    const result = await c.var
      .getServices()
      .removeSetFromWorkoutSession(c.req.valid("param").id);

    if (result.status === "session_finished") {
      return c.json(sessionFinished(result.sessionId, result.finishedAt), 409);
    }

    // Nothing removed reads the same whether it was already removed, never
    // existed or is another User's: each answers 204, so a retried remove
    // succeeds and no id is revealed.
    return c.body(null, 204);
  });
