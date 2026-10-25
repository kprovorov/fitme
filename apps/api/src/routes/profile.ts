import {
  MAX_AGE,
  MAX_BODY_DECIMALS,
  MAX_BODY_HEIGHT,
  MAX_BODY_WEIGHT,
  MIN_AGE,
} from "@fitme/core/limits";
import { genders, measurementSystems } from "@fitme/core/models";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { type ApiEnv, bearerSecurity, requires } from "../auth.js";
import {
  ErrorResponse,
  invalidRequest,
  rateLimitedResponse,
  unauthorizedResponse,
} from "../schemas.js";

// Inline rather than a named component: OpenAPI 3.0 can only mark an inline
// schema nullable (a nullable $ref would make every use of it nullable).
const Profile = z.object({
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
});

const ProfileResponse = z.object({
  data: Profile.nullable().openapi({
    description: "The User's Profile, `null` until they finish onboarding",
  }),
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
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Get the User's Profile",
});

/** The smallest height or weight step an edit accepts: at most `MAX_BODY_DECIMALS` decimals. */
const BODY_STEP = 10 ** -MAX_BODY_DECIMALS;

/** Every field of a Profile a client writes, each with its bounds. */
const profileFields = {
  age: z.number().int().min(MIN_AGE).max(MAX_AGE).openapi({ example: 31 }),
  gender: z.enum(genders),
  height: z
    .number()
    .positive()
    .max(MAX_BODY_HEIGHT)
    .multipleOf(BODY_STEP)
    .openapi({
      description:
        "In the height unit of the resulting measurement system: `cm` (metric) or `in` (us, uk); at most 2 decimals",
      example: 171,
    }),
  measurement_system: z.enum(measurementSystems).openapi({
    description:
      "Changing it converts every stored height and weight of the User (the Profile's, every Plan's set targets and every Workout Session's weights) to the new system's units, rounded to 2 decimals. Between `us` and `uk`, which share units, nothing is converted.",
  }),
  weight: z
    .number()
    .positive()
    .max(MAX_BODY_WEIGHT)
    .multipleOf(BODY_STEP)
    .openapi({
      description:
        "In the weight unit of the resulting measurement system: `kg` (metric) or `lbs` (us, uk); at most 2 decimals",
      example: 61.5,
    }),
};

const ProfileChangesBody = z
  .strictObject(profileFields)
  .partial()
  // The refine answers the 400; minProperties says the same in the OpenAPI
  // document, which can't see a refine.
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "Give at least one field to change",
  })
  .openapi("ProfileChanges", { minProperties: 1 });

const UpdatedProfileResponse = z.object({ data: Profile });

const updateProfile = createRoute({
  description:
    "Changes only the given fields. A new `measurement_system` first converts every stored height and weight of the User (the Profile's, every Plan's set targets and every Workout Session's weights) to the new system's units, then writes the given `height` and `weight` as they are, in the new system's units. Repeating the same request changes nothing more.",
  method: "patch",
  middleware: [requires("write")] as const,
  path: "/",
  request: {
    body: {
      content: { "application/json": { schema: ProfileChangesBody } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: UpdatedProfileResponse } },
      description: "The updated Profile",
    },
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "`invalid_request`: the changes aren't valid",
    },
    401: unauthorizedResponse,
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description:
        "`profile_not_found`: the User has no Profile yet; nothing was changed",
    },
    415: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "The body isn't `application/json`",
    },
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Update the User's Profile",
});

const WholeProfileBody = z.strictObject(profileFields).openapi("WholeProfile");

const replaceProfile = createRoute({
  description:
    "Creates the User's Profile (201), or replaces the one they have (200) exactly as `PATCH /v1/profile` with every field would: a different `measurement_system` first converts every stored height and weight of the User (the Profile's, every Plan's set targets and every Workout Session's weights) to the new system's units, then writes the given `height` and `weight` as they are, in the new system's units. Repeating the same request changes nothing more.",
  method: "put",
  middleware: [requires("write")] as const,
  path: "/",
  request: {
    body: {
      content: { "application/json": { schema: WholeProfileBody } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: UpdatedProfileResponse } },
      description: "The replaced Profile",
    },
    201: {
      content: { "application/json": { schema: UpdatedProfileResponse } },
      description: "The created Profile",
    },
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description:
        "`invalid_request`: a field is missing, unknown or out of bounds; nothing was written",
    },
    401: unauthorizedResponse,
    415: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "The body isn't `application/json`",
    },
    429: rateLimitedResponse,
  },
  security: bearerSecurity,
  summary: "Create or replace the User's Profile",
});

export const profile = new OpenAPIHono<ApiEnv>({
  defaultHook: invalidRequest,
})
  .openapi(getProfile, async (c) => {
    const found = await c.var.getServices().getProfile();
    // Parsed through the contract, so fields beyond it never go out.
    return c.json(ProfileResponse.parse({ data: found }), 200);
  })
  .openapi(updateProfile, async (c) => {
    const updated = await c.var
      .getServices()
      .updateProfile(c.req.valid("json"));
    if (!updated) {
      return c.json(
        {
          error: {
            code: "profile_not_found",
            message: "The User has no Profile yet",
          },
        },
        404
      );
    }
    return c.json(UpdatedProfileResponse.parse({ data: updated }), 200);
  })
  .openapi(replaceProfile, async (c) => {
    const { created, profile: written } = await c.var
      .getServices()
      .replaceProfile(c.req.valid("json"));
    const body = UpdatedProfileResponse.parse({ data: written });
    return created ? c.json(body, 201) : c.json(body, 200);
  });
