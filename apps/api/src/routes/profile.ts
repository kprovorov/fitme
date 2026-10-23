import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import { invalidRequest, unauthorizedResponse } from "../schemas.js";

const Profile = z
  .object({
    age: z.number().openapi({ example: 30 }),
    gender: z.string().openapi({ example: "female" }),
    height: z.number().openapi({
      description: "In `units.height`",
      example: 170.5,
    }),
    measurement_system: z.string().openapi({
      description: "`metric`, `us` or `uk`",
      example: "metric",
    }),
    units: z
      .object({
        height: z.string().openapi({
          description: "`cm` (metric) or `in` (us, uk)",
          example: "cm",
        }),
        weight: z.string().openapi({
          description: "`kg` (metric) or `lbs` (us, uk)",
          example: "kg",
        }),
      })
      .openapi({
        description:
          "The units every height and weight of the User is stored and shown in",
      }),
    weight: z.number().openapi({
      description: "In `units.weight`",
      example: 60.25,
    }),
  })
  .openapi("Profile");

const ProfileResponse = z.object({
  // `null` until the User has finished onboarding
  data: z.union([Profile, z.null()]),
});

const getProfile = createRoute({
  method: "get",
  middleware: [requires("read")] as const,
  path: "/",
  responses: {
    200: {
      content: { "application/json": { schema: ProfileResponse } },
      description: "The User's Profile, or `null` without one",
    },
    401: unauthorizedResponse,
  },
  security: bearerSecurity,
  summary: "Get the User's Profile",
});

export const profile = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
}).openapi(getProfile, async (c) => {
  const found = await c.var.services().getProfile();
  // Parsed through the contract, so fields beyond it never go out.
  return c.json(ProfileResponse.parse({ data: found }), 200);
});
