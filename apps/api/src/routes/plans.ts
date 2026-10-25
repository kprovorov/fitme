import { experienceLevels, goals, places } from "@fitme/core";
import {
  MAX_EXERCISES_PER_WORKOUT,
  MAX_FREQUENCY,
  MAX_PLAN_NAME_LENGTH,
  MAX_PLAN_TEXT_LENGTH,
  MAX_REPS,
  MAX_REST_SECONDS,
  MAX_SETS_PER_EXERCISE,
  MAX_WEIGHT,
  MAX_WORKOUT_DURATION_MINUTES,
  MAX_WORKOUTS_PER_PLAN,
  MIN_FREQUENCY,
} from "@fitme/core/limits";
import type { PlanDetail } from "@fitme/services/plans";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import { checkExerciseSlugs, slugRefusal } from "../library.js";
import {
  ExerciseSlug,
  errorResponse,
  Id,
  invalidRequest,
  rateLimitedResponse,
  unauthorizedResponse,
  WEIGHT_STEP,
  WeightUnit,
} from "../schemas.js";
import type { Weighed } from "../services.js";

/** A Plan's own columns, shared by the summary and the Plan in full. */
const planColumns = {
  created_at: z.string().nullable().openapi({
    description: "ISO 8601",
    example: "2026-10-20T09:00:00+00:00",
  }),
  description: z
    .string()
    .nullable()
    .openapi({ example: "Three full-body days" }),
  experience_level: z.string().openapi({
    description: "`beginner`, `intermediate` or `advanced`",
    example: "intermediate",
  }),
  frequency: z.number().int().openapi({
    description: "Workouts a week",
    example: 3,
  }),
  goal: z.string().openapi({ example: "build_muscle" }),
  id: z.uuid(),
  is_active: z.boolean().openapi({
    description: "The User's active Plan; at most one is",
  }),
  name: z.string().nullable().openapi({ example: "Full body" }),
  note: z.string().nullable(),
  place: z.string().openapi({ description: "`gym` or `home`", example: "gym" }),
  updated_at: z.string().nullable().openapi({
    description: "ISO 8601",
    example: "2026-10-21T09:00:00+00:00",
  }),
  workout_duration: z.number().int().openapi({
    description: "Minutes",
    example: 60,
  }),
};

/** A Workout's place in its Plan's rotation. */
const rotationOrder = z.number().int().openapi({
  description: "Position in the rotation: 1 is up next",
  example: 1,
});

const WorkoutSummary = z
  .object({
    exercise_count: z.number().int().openapi({ example: 5 }),
    id: z.uuid(),
    name: z.string().openapi({ example: "Day A" }),
    order: rotationOrder,
  })
  .openapi("WorkoutSummary");

const PlanSummary = z
  .object({
    ...planColumns,
    workouts: z.array(WorkoutSummary).openapi({
      description: "In rotation order: the first is up next",
    }),
  })
  .openapi("PlanSummary");

const PlanListResponse = z.object({
  data: z.array(PlanSummary).openapi({
    description: "The User's Plans, newest first",
  }),
});

const listPlans = createRoute({
  method: "get",
  middleware: [requires("read")] as const,
  path: "/",
  responses: {
    200: {
      content: { "application/json": { schema: PlanListResponse } },
      description: "Every Plan of the User, newest first (not paged)",
    },
    401: unauthorizedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "List the User's Plans",
});

const PlanSet = z
  .object({
    id: z.uuid(),
    order: z.number().int().openapi({ example: 1 }),
    reps_recommended: z.number().int().openapi({ example: 8 }),
    rest_recommended: z.number().int().openapi({
      description: "Seconds",
      example: 120,
    }),
    weight_recommended: z.number().openapi({
      description: "In the response's `weight_unit`",
      example: 80.5,
    }),
  })
  .openapi("PlanSet");

const PlanExercise = z
  .object({
    exercise_slug: z.string().openapi({
      description:
        "The Exercise Library's key for the Exercise; its name, muscle groups and media come from the Exercise Library API",
      example: "barbell-back-squat",
    }),
    id: z.uuid(),
    order: z.number().int().openapi({ example: 1 }),
    sets: z.array(PlanSet).openapi({ description: "In order" }),
  })
  .openapi("PlanExercise");

const PlanWorkout = z
  .object({
    description: z.string().openapi({ example: "Legs and pulls" }),
    exercises: z.array(PlanExercise).openapi({ description: "In order" }),
    id: z.uuid(),
    name: z.string().openapi({ example: "Day A" }),
    order: rotationOrder,
  })
  .openapi("PlanWorkout");

/** A Plan in full, with the unit its weights are in. */
const planFields = {
  ...planColumns,
  weight_unit: WeightUnit,
  workouts: z.array(PlanWorkout).openapi({
    description: "In rotation order: the first is up next",
  }),
};

const Plan = z.object(planFields).openapi("Plan");

const PlanResponse = z.object({ data: Plan });

const ActivePlanResponse = z.object({
  // Inline rather than the named Plan: OpenAPI 3.0 can only mark an inline
  // schema nullable (a nullable $ref would make every use of it nullable).
  data: z.object(planFields).nullable().openapi({
    description: "The User's active Plan, `null` without one",
  }),
});

/** A Plan read in full, with the unit its weights are in. */
const planData = ({ value, weightUnit }: Weighed<PlanDetail>) => ({
  ...value,
  weight_unit: weightUnit,
});

const getActivePlan = createRoute({
  method: "get",
  middleware: [requires("read")] as const,
  path: "/active",
  responses: {
    200: {
      content: { "application/json": { schema: ActivePlanResponse } },
      description: "The User's active Plan in full, or `null` without one",
    },
    401: unauthorizedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Get the User's active Plan",
});

/** The documented 404 of a route addressing a Plan the User has no live copy of. */
const planNotFoundResponse = errorResponse(
  "`not_found`: no such Plan, it was deleted, or it isn't the User's"
);

const getPlan = createRoute({
  method: "get",
  middleware: [requires("read")] as const,
  path: "/{id}",
  request: {
    params: z.object({
      id: z.uuid().openapi({ param: { in: "path", name: "id" } }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: PlanResponse } },
      description:
        "The Plan in full: its Workouts, their Exercises and sets, each in order",
    },
    400: errorResponse("`invalid_request`: the id isn't a uuid"),
    401: unauthorizedResponse,
    404: planNotFoundResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Get one of the User's Plans",
});

const NewPlanSet = z
  .strictObject({
    reps_recommended: z.number().int().min(1).max(MAX_REPS).openapi({
      example: 8,
    }),
    rest_recommended: z.number().int().min(0).max(MAX_REST_SECONDS).openapi({
      description: "Seconds",
      example: 120,
    }),
    weight_recommended: z
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
  .openapi("NewPlanSet");

const NewPlanExercise = z
  .strictObject({
    exercise_slug: ExerciseSlug,
    sets: z
      .array(NewPlanSet)
      .min(1)
      .max(MAX_SETS_PER_EXERCISE)
      .openapi({ description: "In the order they are performed" }),
  })
  .openapi("NewPlanExercise");

const NewPlanWorkout = z
  .strictObject({
    description: z
      .string()
      .max(MAX_PLAN_TEXT_LENGTH)
      .openapi({ example: "Legs and pulls" }),
    exercises: z
      .array(NewPlanExercise)
      .min(1)
      .max(MAX_EXERCISES_PER_WORKOUT)
      .openapi({ description: "In the order they are performed" }),
    name: z
      .string()
      .trim()
      .min(1)
      .max(MAX_PLAN_NAME_LENGTH)
      .openapi({ example: "Day A" }),
  })
  .openapi("NewPlanWorkout");

/** Every Workout of a Plan, as a create or a replacement sends them. */
const PlanWorkoutsInput = z
  .array(NewPlanWorkout)
  .min(1)
  .max(MAX_WORKOUTS_PER_PLAN)
  .openapi({
    description:
      "Every Workout of the Plan, in rotation order: the first is up next. Every `order` comes from the array positions",
  });

/** A Plan's metadata as a write takes it (create, or change on its own). */
const planMetadataFields = {
  description: z
    .string()
    .max(MAX_PLAN_TEXT_LENGTH)
    .openapi({ example: "Three full-body days" }),
  experience_level: z.enum(experienceLevels),
  frequency: z.number().int().min(MIN_FREQUENCY).max(MAX_FREQUENCY).openapi({
    description: "Workouts a week",
    example: 3,
  }),
  goal: z.enum(goals),
  name: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PLAN_NAME_LENGTH)
    .openapi({ example: "Full body" }),
  note: z.string().max(MAX_PLAN_TEXT_LENGTH).nullable().optional(),
  place: z.enum(places),
  workout_duration: z
    .number()
    .int()
    .min(1)
    .max(MAX_WORKOUT_DURATION_MINUTES)
    .openapi({ description: "Minutes", example: 60 }),
};

const NewPlanBody = z
  .strictObject({
    activate: z.boolean().default(true).openapi({
      description:
        "Make it the User's active Plan, every other Plan inactive. With `false` it's created inactive and the active Plan stays",
    }),
    ...planMetadataFields,
    workouts: PlanWorkoutsInput,
  })
  .openapi("NewPlan");

const createPlanRoute = createRoute({
  description:
    "Creates the Plan with its Workouts, Exercises and sets in one transaction: nothing is saved unless all of it is. Every Exercise slug is checked against the Exercise Library first. By default the new Plan becomes the User's active one and every other Plan goes inactive. Not idempotent: a retried request can create a second Plan.",
  method: "post",
  middleware: [requires("write")] as const,
  path: "/",
  request: {
    body: {
      content: { "application/json": { schema: NewPlanBody } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: PlanResponse } },
      description: "The created Plan in full",
    },
    400: errorResponse(
      "`invalid_request`: the Plan isn't valid; `unknown_exercises`: the Exercise Library has no Exercise for the slugs the message names. Nothing was saved"
    ),
    401: unauthorizedResponse,
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
    503: errorResponse(
      "`exercise_library_unavailable`: the Exercise slugs couldn't be checked; nothing was saved, try again"
    ),
  },
  security: bearerSecurity,
  summary: "Create a Plan",
});

const ReplaceWorkoutsBody = z
  .strictObject({ workouts: PlanWorkoutsInput })
  .openapi("ReplacePlanWorkouts");

const replaceWorkoutsRoute = createRoute({
  description:
    "Replaces every Workout of the Plan with the sent list, in one transaction: nothing changes unless all of it is saved. **Every Workout gets a new id**, the old ones are gone: past Workout Sessions keep their logged sets but lose the link to their old Workout. The Plan's details and whether it's active don't change (only its `updated_at` moves). Every Exercise slug is checked against the Exercise Library first.",
  method: "put",
  middleware: [requires("write")] as const,
  path: "/{id}/workouts",
  request: {
    body: {
      content: { "application/json": { schema: ReplaceWorkoutsBody } },
      required: true,
    },
    params: z.object({
      id: z.uuid().openapi({ param: { in: "path", name: "id" } }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: PlanResponse } },
      description: "The Plan in full, with its new Workouts",
    },
    400: errorResponse(
      "`invalid_request`: the id isn't a uuid or the Workouts aren't valid; `unknown_exercises`: the Exercise Library has no Exercise for the slugs the message names. Nothing was changed"
    ),
    401: unauthorizedResponse,
    404: planNotFoundResponse,
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
    503: errorResponse(
      "`exercise_library_unavailable`: the Exercise slugs couldn't be checked; nothing was changed, try again"
    ),
  },
  security: bearerSecurity,
  summary: "Replace a Plan's Workouts",
});

/** The Plan a route addresses, by id. */
const PlanParams = z.object({ id: Id });

const PlanChangesBody = z
  // Strict, so `workouts` (and any other field) is refused: this route never
  // touches Workouts.
  .strictObject(planMetadataFields)
  .partial()
  // The refine answers the 400; minProperties says the same in the OpenAPI
  // document, which can't see a refine.
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "Give at least one field to change",
  })
  .openapi("PlanChanges", { minProperties: 1 });

const updatePlanRoute = createRoute({
  description:
    "Changes only the given metadata fields (`note: null` clears the note). The Plan's Workouts, Exercises and sets, and their ids, are left as they are: a body with `workouts` is refused. Doesn't change which Plan is active. A 404 changes nothing.",
  method: "patch",
  middleware: [requires("write")] as const,
  path: "/{id}",
  request: {
    body: {
      content: { "application/json": { schema: PlanChangesBody } },
      required: true,
    },
    params: PlanParams,
  },
  responses: {
    200: {
      content: { "application/json": { schema: PlanResponse } },
      description: "The changed Plan in full",
    },
    400: errorResponse(
      "`invalid_request`: the id isn't a uuid, or the changes aren't valid (no field, an unknown one such as `workouts`, or a bad value); nothing was changed"
    ),
    401: unauthorizedResponse,
    404: planNotFoundResponse,
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Change a Plan's details",
});

/** The body of a 404 for a Plan the User has no live copy of. */
const PLAN_NOT_FOUND = {
  error: { code: "not_found", message: "Plan not found" },
} as const;

const activatePlanRoute = createRoute({
  description:
    "Makes the Plan the User's active one; every other Plan of the User goes inactive, so at most one is active. Activating the active Plan changes nothing.",
  method: "post",
  middleware: [requires("write")] as const,
  path: "/{id}/activate",
  request: { params: PlanParams },
  responses: {
    200: {
      content: { "application/json": { schema: PlanResponse } },
      description: "The activated Plan in full",
    },
    400: errorResponse("`invalid_request`: the id isn't a uuid"),
    401: unauthorizedResponse,
    404: planNotFoundResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Activate a Plan",
});

const deletePlanRoute = createRoute({
  description:
    "Soft-deletes the Plan: it leaves the User's Plans, stops being active, and answers 404 everywhere afterwards. The User's logged Workout Sessions stay. Deleting a Plan already deleted answers 204 again, so a retry is harmless.",
  method: "delete",
  middleware: [requires("write")] as const,
  path: "/{id}",
  request: { params: PlanParams },
  responses: {
    204: { description: "Deleted, now or before" },
    400: errorResponse("`invalid_request`: the id isn't a uuid"),
    401: unauthorizedResponse,
    404: errorResponse(
      "`not_found`: the User never had such a Plan (it's missing or another User's); nothing was changed"
    ),
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Delete a Plan",
});

/** Every Exercise slug of a Plan's Workouts, each once. */
const workoutSlugs = (workouts: z.infer<typeof NewPlanWorkout>[]) => [
  ...new Set(
    workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.exercise_slug)
    )
  ),
];

export const plans = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(listPlans, async (c) => {
    const found = await c.var.getServices().listPlans();
    // Parsed through the contract, so fields beyond it never go out.
    return c.json(PlanListResponse.parse({ data: found }), 200);
  })
  .openapi(createPlanRoute, async (c) => {
    const { activate, ...plan } = c.req.valid("json");
    const refusal = slugRefusal(
      await checkExerciseSlugs({
        library: c.var.getLibrary(),
        reportError: c.var.reportError,
        slugs: workoutSlugs(plan.workouts),
      })
    );
    if (refusal) {
      return c.json(refusal.body, refusal.status);
    }
    const created = await c.var.getServices().createPlan(plan, { activate });
    return c.json(PlanResponse.parse({ data: planData(created) }), 201);
  })
  // Before `/{id}`, which would otherwise answer "active" as a malformed id.
  .openapi(getActivePlan, async (c) => {
    const found = await c.var.getServices().getActivePlan();
    return c.json(
      ActivePlanResponse.parse({ data: found && planData(found) }),
      200
    );
  })
  .openapi(getPlan, async (c) => {
    const found = await c.var.getServices().getPlan(c.req.valid("param").id);
    if (!found) {
      return c.json(PLAN_NOT_FOUND, 404);
    }
    return c.json(PlanResponse.parse({ data: planData(found) }), 200);
  })
  .openapi(replaceWorkoutsRoute, async (c) => {
    const { workouts } = c.req.valid("json");
    const refusal = slugRefusal(
      await checkExerciseSlugs({
        library: c.var.getLibrary(),
        reportError: c.var.reportError,
        slugs: workoutSlugs(workouts),
      })
    );
    if (refusal) {
      return c.json(refusal.body, refusal.status);
    }
    const replaced = await c.var
      .getServices()
      .replaceWorkouts(c.req.valid("param").id, workouts);
    if (!replaced) {
      return c.json(PLAN_NOT_FOUND, 404);
    }
    return c.json(PlanResponse.parse({ data: planData(replaced) }), 200);
  })
  .openapi(updatePlanRoute, async (c) => {
    const updated = await c.var
      .getServices()
      .updatePlan(c.req.valid("param").id, c.req.valid("json"));
    if (!updated) {
      return c.json(PLAN_NOT_FOUND, 404);
    }
    return c.json(PlanResponse.parse({ data: planData(updated) }), 200);
  })
  .openapi(activatePlanRoute, async (c) => {
    const activated = await c.var
      .getServices()
      .activatePlan(c.req.valid("param").id);
    if (!activated) {
      return c.json(PLAN_NOT_FOUND, 404);
    }
    return c.json(PlanResponse.parse({ data: planData(activated) }), 200);
  })
  .openapi(deletePlanRoute, async (c) => {
    const result = await c.var
      .getServices()
      .deletePlan(c.req.valid("param").id);
    // Already deleted answers 204 too; only a Plan the User never had is a 404
    if (!result) {
      return c.json(PLAN_NOT_FOUND, 404);
    }
    return c.body(null, 204);
  });
