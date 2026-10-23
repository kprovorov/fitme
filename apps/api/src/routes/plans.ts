import type { PlanDetail } from "@fitme/services/plans";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import {
  ErrorResponse,
  invalidRequest,
  notFoundResponse,
  unauthorizedResponse,
  WeightUnit,
  weightUnitFor,
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

const WorkoutSummary = z
  .object({
    exercise_count: z.number().int().openapi({ example: 5 }),
    id: z.uuid(),
    name: z.string().openapi({ example: "Day A" }),
    order: z.number().int().openapi({
      description: "Position in the rotation: 1 is up next",
      example: 1,
    }),
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
    order: z.number().int().openapi({
      description: "Position in the rotation: 1 is up next",
      example: 1,
    }),
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
const planData = ({ measurementSystem, value }: Weighed<PlanDetail>) => ({
  ...value,
  weight_unit: weightUnitFor(measurementSystem),
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
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "`invalid_request`: the id isn't a uuid",
    },
    401: unauthorizedResponse,
    404: notFoundResponse(
      "`not_found`: no such Plan, it was deleted, or it isn't the User's"
    ),
  },
  security: bearerSecurity,
  summary: "Get one of the User's Plans",
});

export const plans = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(listPlans, async (c) => {
    const found = await c.var.getServices().listPlans();
    // Parsed through the contract, so fields beyond it never go out.
    return c.json(PlanListResponse.parse({ data: found }), 200);
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
  });
