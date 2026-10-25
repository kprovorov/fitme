import type { PlanUpdate as PlanUpdateAnswer } from "@fitme/services/plan-update";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";
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
  timestamp,
  unauthorizedResponse,
  WeightUnit,
  WorkoutSessionExercise,
  WorkoutSessionExerciseResponse,
} from "../schemas.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

const FinishedWorkoutSessionResponse = z.object({
  already_finished: z.boolean().openapi({
    description:
      "`true` when it was finished before this request, which then changed nothing",
  }),
  data: WorkoutSession,
});

const notFoundResponse = errorResponse(
  "`not_found`: the User has no Workout Session with this id"
);

const notFound = {
  error: { code: "not_found", message: "Workout Session not found" },
} as const;

const addExerciseRoute = createRoute({
  description:
    "Appends an Exercise, with no sets, after the last Exercise of an open Workout Session. The Exercise slug is checked against the Library first. A finished Workout Session can't change. Not idempotent: a retried request can add the Exercise twice.",
  method: "post",
  middleware: [requires("write")] as const,
  path: "/{id}/exercises",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .strictObject({ exercise_slug: ExerciseSlug })
            .openapi("AddWorkoutSessionExercise"),
        },
      },
      required: true,
    },
    params: z.object({ id: Id }),
  },
  responses: {
    201: {
      content: {
        "application/json": { schema: WorkoutSessionExerciseResponse },
      },
      description: "The added Workout Session Exercise, with its sets (none)",
    },
    400: errorResponse(
      "`invalid_request`: the id isn't a uuid or the body isn't valid; `unknown_exercises`: the Library has no Exercise for the slug the message names. Nothing was written"
    ),
    401: unauthorizedResponse,
    404: notFoundResponse,
    409: sessionFinishedResponse,
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
    503: errorResponse(
      "`library_unavailable`: the Exercise slug couldn't be checked; nothing was written, try again"
    ),
  },
  security: bearerSecurity,
  summary: "Add an Exercise to a Workout Session",
});

const startWorkoutSessionRoute = createRoute({
  description:
    "Starts a Workout Session for one of the User's Workouts, copying its Exercises and sets in order. A Workout has at most one open Workout Session: when one is already open, it's resumed (200) instead of a new one being created (201), so a retried start never duplicates it.",
  method: "post",
  middleware: [requires("write")] as const,
  path: "/",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .strictObject({
              workout_id: Id.openapi({
                description: "The Workout to start, from a Plan of the User",
              }),
            })
            .openapi("StartWorkoutSession"),
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: WorkoutSessionResponse } },
      description:
        "Resumed: the Workout Session already open for this Workout, in full",
    },
    201: {
      content: { "application/json": { schema: WorkoutSessionResponse } },
      description: "Started: the new Workout Session, in full",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: errorResponse(
      "`not_found`: the User has no such Workout, or its Plan is deleted"
    ),
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Start or resume a Workout Session",
});

const finishWorkoutSessionRoute = createRoute({
  description:
    "Finishes the Workout Session and moves its Workout to the end of its Plan's rotation (unless that Workout is gone). Finishing an already finished Workout Session changes nothing and answers `already_finished: true`, so a retried finish is harmless.",
  method: "post",
  middleware: [requires("write")] as const,
  path: "/{id}/finish",
  request: { params: z.object({ id: Id }) },
  responses: {
    200: {
      content: {
        "application/json": { schema: FinishedWorkoutSessionResponse },
      },
      description: "The finished Workout Session, in full",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Finish a Workout Session",
});

const deleteWorkoutSessionRoute = createRoute({
  description:
    "Deletes the Workout Session with its Exercises and logged sets, for good. Idempotent: an id the User has no Workout Session with (already deleted, never existed, or another User's, which is left untouched) answers 204 too.",
  method: "delete",
  middleware: [requires("write")] as const,
  path: "/{id}",
  request: { params: z.object({ id: Id }) },
  responses: {
    204: { description: "The User has no Workout Session with this id now" },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Delete a Workout Session",
});

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
    429: rateLimitedResponse,
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
    404: notFoundResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Get one of the User's Workout Sessions",
});

const slugField = (description: string) =>
  z.string().openapi({ description, example: "barbell-bench-press" });

const PlanUpdateSet = z
  .object({
    reps: z.int().openapi({ example: 8 }),
    weight: z.number().openapi({
      description: "In `weight_unit`, as logged",
      example: 80,
    }),
  })
  .openapi("PlanUpdateSet", {
    description:
      "A set the Plan gets, its targets taken from what the User logged",
  });

const planUpdateSets = z
  .array(PlanUpdateSet)
  .openapi({ description: "In order" });

const PlanUpdateChange = z
  .discriminatedUnion("kind", [
    z.object({
      exercise_slug: slugField("The Exercise the Workout gets in its place"),
      kind: z.literal("replace_exercise"),
      replaced_exercise_slug: slugField("The Exercise it replaces"),
      sets: planUpdateSets.openapi({
        description: "Every set of the replacement, in order",
      }),
    }),
    z.object({
      exercise_slug: slugField("The Exercise appended to the Workout"),
      kind: z.literal("add_exercise"),
      sets: planUpdateSets,
    }),
    z.object({
      exercise_slug: slugField("The Exercise removed from the Workout"),
      kind: z.literal("remove_exercise"),
    }),
    z.object({
      exercise_slug: slugField("The Exercise that gets more sets"),
      kind: z.literal("add_sets"),
      sets: planUpdateSets.openapi({
        description: "The sets appended after its last one, in order",
      }),
    }),
  ])
  .openapi("PlanUpdateChange", {
    description:
      "One change to the Workout, by `kind`. Exercises are Exercise slugs only: their names come from the Library",
  });

const PlanUpdate = z
  .object({
    changes: z.array(PlanUpdateChange).openapi({
      description:
        "In Workout order. None for a Workout Session still open, without a Workout, of a deleted Plan, whose Exercises can't be matched (a repeated `order`, over 50 Exercises or 100 sets of one), or whose Plan Update is already applied",
    }),
    // Inline rather than named components: OpenAPI 3.0 can only mark an
    // inline schema nullable.
    plan: z.object({ id: Id, name: z.string().nullable() }).nullable().openapi({
      description:
        "The Plan it updates, `null` when the Workout is gone or its Plan deleted",
    }),
    weight_unit: WeightUnit,
    workout: z.object({ id: Id, name: z.string() }).nullable().openapi({
      description:
        "The Workout it updates, `null` when it's gone or its Plan deleted",
    }),
  })
  .openapi("PlanUpdate");

const PlanUpdateResponse = z.object({ data: PlanUpdate });

/** Both Plan Update routes' answer: the Plan Update, or 404 without the Workout Session. */
const planUpdateAnswer = (
  c: Context<ApiEnv>,
  planUpdate: PlanUpdateAnswer | null
) =>
  planUpdate
    ? c.json(PlanUpdateResponse.parse({ data: planUpdate }), 200)
    : c.json(notFound, 404);

const previewPlanUpdateRoute = createRoute({
  description:
    "The Plan Update of a finished Workout Session: the changes it made to its Workout (Exercises replaced, added or removed, sets added), which the User can save to the Plan. Writes nothing. A Workout Session without a Plan Update answers no changes.",
  method: "get",
  middleware: [requires("read")] as const,
  path: "/{id}/plan-update",
  request: { params: z.object({ id: Id }) },
  responses: {
    200: {
      content: { "application/json": { schema: PlanUpdateResponse } },
      description: "The Plan Update, possibly without changes",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Preview a Workout Session's Plan Update",
});

const applyPlanUpdateRoute = createRoute({
  description:
    "Applies the Plan Update of a finished Workout Session to its Workout in one transaction (replacements and added sets, then removals renumbering the rest from 1, then added Exercises appended) and answers what it applied. Once applied, the Workout Session has no Plan Update: a repeated or concurrent apply answers no changes and writes nothing.",
  method: "post",
  middleware: [requires("write")] as const,
  path: "/{id}/plan-update",
  request: { params: z.object({ id: Id }) },
  responses: {
    200: {
      content: { "application/json": { schema: PlanUpdateResponse } },
      description: "What was applied, possibly nothing",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    404: notFoundResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Apply a Workout Session's Plan Update",
});

export const workoutSessions = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(getWorkoutSession, async (c) => {
    const { id } = c.req.valid("param");
    const found = await c.var.getServices().getWorkoutSession(id);
    if (!found) {
      return c.json(notFound, 404);
    }
    const { value, weightUnit } = found;
    return c.json(
      WorkoutSessionResponse.parse({
        data: { ...value, weight_unit: weightUnit },
      }),
      200
    );
  })
  .openapi(startWorkoutSessionRoute, async (c) => {
    const { workout_id } = c.req.valid("json");
    const { value, weightUnit } = await c.var
      .getServices()
      .startWorkoutSession(workout_id);
    if (value.status === "not_found") {
      return c.json(
        { error: { code: "not_found", message: "Workout not found" } },
        404
      );
    }
    const body = WorkoutSessionResponse.parse({
      data: { ...value.session, weight_unit: weightUnit },
    });
    if (value.resumed) {
      return c.json(body, 200);
    }
    return c.json(body, 201);
  })
  .openapi(finishWorkoutSessionRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { value, weightUnit } = await c.var
      .getServices()
      .finishWorkoutSession(id);
    if (value.status === "not_found") {
      return c.json(notFound, 404);
    }
    return c.json(
      FinishedWorkoutSessionResponse.parse({
        already_finished: value.alreadyFinished,
        data: { ...value.session, weight_unit: weightUnit },
      }),
      200
    );
  })
  .openapi(previewPlanUpdateRoute, async (c) =>
    planUpdateAnswer(
      c,
      await c.var.getServices().previewPlanUpdate(c.req.valid("param").id)
    )
  )
  .openapi(applyPlanUpdateRoute, async (c) =>
    planUpdateAnswer(
      c,
      await c.var.getServices().applyPlanUpdate(c.req.valid("param").id)
    )
  )
  .openapi(addExerciseRoute, async (c) => {
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
      .addExerciseToWorkoutSession({
        exerciseSlug: exercise_slug,
        sessionId: id,
      });
    if (value.status === "not_found") {
      return c.json(notFound, 404);
    }
    if (value.status === "session_finished") {
      return c.json(sessionFinished(id, value.finishedAt), 409);
    }
    return c.json(
      WorkoutSessionExerciseResponse.parse({
        data: { ...value.exercise, weight_unit: weightUnit },
      }),
      201
    );
  })
  .openapi(deleteWorkoutSessionRoute, async (c) => {
    // Nothing deleted reads the same whether it was already deleted, never
    // existed or is another User's (RLS hides it): each answers 204, so a
    // retried delete succeeds and no id is revealed.
    await c.var.getServices().deleteWorkoutSession(c.req.valid("param").id);
    return c.body(null, 204);
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
