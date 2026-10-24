import { experienceLevels, goals, places } from "@fitme/core";
import { MAX_REPS, MAX_WEIGHT, MAX_WEIGHT_DECIMALS } from "@fitme/core/limits";
import type { PlanDetail } from "@fitme/services/plans";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import { checkExerciseSlugs, type SlugCheck } from "../exercise-library.js";
import {
  ErrorResponse,
  invalidRequest,
  rateLimitedResponse,
  unauthorizedResponse,
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

/** An error answered on purpose (unreported), in the error shape. */
const errorResponse = (description: string) => ({
  content: { "application/json": { schema: ErrorResponse } },
  description,
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
    404: errorResponse(
      "`not_found`: no such Plan, it was deleted, or it isn't the User's"
    ),
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Get one of the User's Plans",
});

const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;
const MAX_WORKOUTS = 14;
const MAX_EXERCISES_PER_WORKOUT = 30;
const MAX_SETS_PER_EXERCISE = 20;
const MAX_REST_SECONDS = 3600;
const MIN_FREQUENCY = 1;
const MAX_FREQUENCY = 7;
const MAX_WORKOUT_DURATION_MINUTES = 600;
const MAX_SLUG_LENGTH = 100;
/** Lowercase letters and digits, words joined by single hyphens (apps/exercises' rule). */
const EXERCISE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WEIGHT_STEP = 10 ** -MAX_WEIGHT_DECIMALS;

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
    exercise_slug: z
      .string()
      .max(MAX_SLUG_LENGTH)
      .regex(
        EXERCISE_SLUG,
        "must be an Exercise slug: lowercase letters and digits, words joined by single hyphens"
      )
      .openapi({
        description:
          "An Exercise slug from the Exercise Library API; every one is checked before anything is written",
        example: "barbell-back-squat",
      }),
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
      .max(MAX_TEXT_LENGTH)
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
      .max(MAX_NAME_LENGTH)
      .openapi({ example: "Day A" }),
  })
  .openapi("NewPlanWorkout");

/** Every Workout of a Plan, as a create or a replacement sends them. */
const PlanWorkoutsInput = z
  .array(NewPlanWorkout)
  .min(1)
  .max(MAX_WORKOUTS)
  .openapi({
    description:
      "Every Workout of the Plan, in rotation order: the first is up next. Every `order` comes from the array positions",
  });

const NewPlanBody = z
  .strictObject({
    activate: z.boolean().default(true).openapi({
      description:
        "Make it the User's active Plan, every other Plan inactive. With `false` it's created inactive and the active Plan stays",
    }),
    description: z
      .string()
      .max(MAX_TEXT_LENGTH)
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
      .max(MAX_NAME_LENGTH)
      .openapi({ example: "Full body" }),
    note: z.string().max(MAX_TEXT_LENGTH).nullable().optional(),
    place: z.enum(places),
    workout_duration: z
      .number()
      .int()
      .min(1)
      .max(MAX_WORKOUT_DURATION_MINUTES)
      .openapi({ description: "Minutes", example: 60 }),
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
    404: errorResponse(
      "`not_found`: no such Plan, it was deleted, or it isn't the User's"
    ),
    415: errorResponse("The body isn't `application/json`"),
    429: rateLimitedResponse,
    503: errorResponse(
      "`exercise_library_unavailable`: the Exercise slugs couldn't be checked; nothing was changed, try again"
    ),
  },
  security: bearerSecurity,
  summary: "Replace a Plan's Workouts",
});

/** Every Exercise slug of a Plan's Workouts, each once. */
const workoutSlugs = (workouts: z.infer<typeof NewPlanWorkout>[]) => [
  ...new Set(
    workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.exercise_slug)
    )
  ),
];

/** The error a write answers when its Exercise slugs aren't all known, or `null` when they are. */
const slugRefusal = (check: SlugCheck) => {
  if (check.status === "unavailable") {
    return {
      body: {
        error: {
          code: "exercise_library_unavailable",
          message:
            "The Exercise Library is unavailable, so the Exercises couldn't be checked; try again",
        },
      },
      status: 503 as const,
    };
  }
  if (check.status === "unknown") {
    return {
      body: {
        error: {
          code: "unknown_exercises",
          message: `Unknown exercise_slug(s): ${check.slugs.join(", ")}`,
        },
      },
      status: 400 as const,
    };
  }
  return null;
};

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
        library: c.var.getExerciseLibrary(),
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
      return c.json(
        { error: { code: "not_found", message: "Plan not found" } },
        404
      );
    }
    return c.json(PlanResponse.parse({ data: planData(found) }), 200);
  })
  .openapi(replaceWorkoutsRoute, async (c) => {
    const { workouts } = c.req.valid("json");
    const refusal = slugRefusal(
      await checkExerciseSlugs({
        library: c.var.getExerciseLibrary(),
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
      return c.json(
        { error: { code: "not_found", message: "Plan not found" } },
        404
      );
    }
    return c.json(PlanResponse.parse({ data: planData(replaced) }), 200);
  });
