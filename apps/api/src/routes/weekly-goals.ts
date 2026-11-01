import { MAX_FREQUENCY, MIN_FREQUENCY } from "@fitme/core/limits";
import { calendarOffsetMinutes } from "@fitme/core/weekly-goals";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import {
  invalidRequest,
  invalidRequestResponse,
  rateLimitedResponse,
  timestamp,
  unauthorizedResponse,
} from "../schemas.js";

const IANA_TIME_ZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;

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
  streak: z.number().int().nonnegative().openapi({
    description:
      "Consecutive goal-hit weeks, across all retained history; a pending current week preserves the preceding streak",
    example: 11,
  }),
});

const listWeeklyGoals = createRoute({
  description: [
    "Every change of the User's Weekly goal (ADR 0015), oldest first, unpaged. The goal is the active Plan's training frequency, recorded whenever a Plan write or a finished Workout Session finds it changed; recorded changes are never rewritten.",
    "",
    "The additive `streak` counts consecutive goal-hit weeks across all retained history, including the current week once met. An unmet current week preserves the preceding run; a completed miss or unknown goal breaks it. Zero without an active goal. Supply the device IANA or fixed-offset calendar `time_zone` (such as GMT+1 or GMT-03:30) for local boundaries (UTC when omitted).",
    "",
    "Weeks run Monday to Sunday on the client's own clock. The first change started tracking and sets the goal of the week it falls in (the first tracked, partial week); every later change takes effect the Monday after it, so a week's goal is the one in effect when it began. Weeks before the first change, or that began with `target: null`, have no known goal.",
  ].join("\n"),
  method: "get",
  middleware: [requires("read")] as const,
  path: "/",
  request: {
    query: z.object({
      time_zone: z
        .string()
        .max(100)
        .refine((value) => {
          if (calendarOffsetMinutes(value) !== null) {
            return true;
          }
          if (!IANA_TIME_ZONE.test(value)) {
            return false;
          }
          try {
            new Intl.DateTimeFormat("en", {
              timeZone: value,
            }).resolvedOptions();
            return true;
          } catch {
            return false;
          }
        }, "Expected an IANA or fixed-offset calendar timezone")
        .default("UTC")
        .openapi({
          description:
            "Device IANA timezone or fixed-offset calendar ID (GMT+1, GMT-03:30); UTC when omitted",
          example: "Europe/Kyiv",
        }),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: WeeklyGoalChanges } },
      description: "The User's Weekly goal changes",
    },
    400: invalidRequestResponse,
    401: unauthorizedResponse,
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "List the User's Weekly goal changes",
});

export const weeklyGoals = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
}).openapi(listWeeklyGoals, async (c) => {
  const { time_zone } = c.req.valid("query");
  const { changes, streak } = await c.var
    .getServices()
    .getWeeklyGoals(time_zone);
  // Parsed through the contract, so fields beyond it never go out.
  return c.json(WeeklyGoalChanges.parse({ data: changes, streak }), 200);
});
