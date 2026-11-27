import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { bearerSecurity, requires } from "../auth.js";
import type { ApiEnv } from "../auth.js";
import {
  errorResponse,
  Id,
  invalidRequest,
  invalidRequestResponse,
  LoggedSet,
  NOTE_REFUSALS,
  NoteText,
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

const setNoteRoute = createRoute({
  description:
    "Sets the User's note on one logged set (one with `reps_completed`, a bodyweight set included) to `note`, trimmed; empty or whitespace-only text clears it. Unlike the other set writes it works on a finished Workout Session too, and it changes nothing but the note: not the result, `logged_at` or `order`. The last save wins, and a repeat answers the same.",
  method: "put",
  middleware: [requires("write")] as const,
  path: "/{id}/note",
  request: {
    body: {
      content: {
        "application/json": { schema: z.strictObject({ note: NoteText }) },
      },
      required: true,
    },
    params: z.object({ id: Id }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: WorkoutSessionSetResponse } },
      description: "The set with its note as saved (`null` once cleared)",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: errorResponse(
      "`not_found`: no set of the User's Workout Sessions has this id; nothing was written"
    ),
    409: errorResponse(
      "`set_not_logged`: the set has no reps logged, so it can't carry a note; nothing was written"
    ),
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Set a Workout Session set's note",
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
  })
  .openapi(setNoteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { note } = c.req.valid("json");

    const { value, weightUnit } = await c.var
      .getServices()
      .setWorkoutSessionSetNote({ note, setId: id });

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

    if (value.status === "not_logged") {
      return c.json(
        {
          error: {
            code: "set_not_logged",
            message: `Workout Session set ${id} has no reps logged; only a logged set can carry a note`,
          },
        },
        409
      );
    }

    // The schema ran the same rule, so this only guards against the two
    // drifting apart; the message still never quotes the text.
    if (value.status === "invalid") {
      return c.json(
        {
          error: {
            code: "invalid_request",
            message: `note: ${NOTE_REFUSALS[value.reason]}`,
          },
        },
        400
      );
    }

    // No expected note is sent, so a conflict means the service and this
    // route disagree: a reported 500 rather than another writer's text
    // answered as this save.
    if (value.status === "conflict") {
      throw new Error("Setting a set's note with no expected note conflicted");
    }

    return c.json(
      WorkoutSessionSetResponse.parse({
        data: { ...value.set, weight_unit: weightUnit },
      }),
      200
    );
  });
