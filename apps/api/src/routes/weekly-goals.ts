import { MAX_FREQUENCY, MIN_FREQUENCY } from "@fitme/core/limits";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import {
  invalidRequest,
  rateLimitedResponse,
  timestamp,
  unauthorizedResponse,
} from "../schemas.js";

const WeeklyGoalChange = z
  .object({
    recorded_at: timestamp("When the Weekly goal changed"),
    target: z
      .number()
      .int()
      .min(MIN_FREQUENCY)
      .max(MAX_FREQUENCY)
      .nullable()
      .openapi({
        description:
          "Qualifying Workout Sessions a week, the active Plan's training frequency; `null` once no Plan is active",
        example: 4,
      }),
  })
  .openapi("WeeklyGoalChange");

const WeeklyGoalChanges = z.object({
  data: z.array(WeeklyGoalChange).openapi({
    description: "Every change, oldest first; empty before tracking started",
  }),
});

const listWeeklyGoals = createRoute({
  description: [
    "Every change of the User's Weekly goal (ADR 0015), oldest first, unpaged. The goal is the active Plan's training frequency, recorded whenever a Plan write or a finished Workout Session finds it changed; recorded changes are never rewritten.",
    "",
    "Weeks run Monday to Sunday on the client's own clock. The first change started tracking and sets the goal of the week it falls in (the first tracked, partial week); every later change takes effect the Monday after it, so a week's goal is the one in effect when it began. Weeks before the first change, or that began with `target: null`, have no known goal.",
  ].join("\n"),
  method: "get",
  middleware: [requires("read")] as const,
  path: "/",
  responses: {
    200: {
      content: { "application/json": { schema: WeeklyGoalChanges } },
      description: "The User's Weekly goal changes",
    },
    401: unauthorizedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "List the User's Weekly goal changes",
});

export const weeklyGoals = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
}).openapi(listWeeklyGoals, async (c) => {
  const changes = await c.var.getServices().listWeeklyGoalChanges();
  // Parsed through the contract, so fields beyond it never go out.
  return c.json(WeeklyGoalChanges.parse({ data: changes }), 200);
});
