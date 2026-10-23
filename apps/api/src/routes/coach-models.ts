import {
  coachModels as allCoachModels,
  defaultCoachModelId,
} from "@fitme/core";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  invalidRequest,
  PUBLIC_CACHE_CONTROL,
  publicCacheHeaders,
} from "../schemas.js";

const CoachModel = z
  .object({
    description: z.string(),
    id: z.string().openapi({ example: defaultCoachModelId }),
    label: z.string(),
  })
  .openapi("CoachModel");

const CoachModels = z
  .object({
    data: z.object({
      defaultId: z.string().openapi({
        description: "The model the Coach uses when a turn names none.",
        example: defaultCoachModelId,
      }),
      models: z.array(CoachModel),
    }),
  })
  .openapi("CoachModels");

const listCoachModels = createRoute({
  method: "get",
  path: "/",
  responses: {
    200: {
      content: { "application/json": { schema: CoachModels } },
      description: "Every model the Coach accepts, in list order",
      headers: publicCacheHeaders,
    },
  },
  summary: "Coach models",
});

// Public: the list isn't secret, and the Coach channel does the real gating.
export const coachModels = new OpenAPIHono({
  defaultHook: invalidRequest,
}).openapi(listCoachModels, (c) => {
  c.header("Cache-Control", PUBLIC_CACHE_CONTROL);
  return c.json(
    {
      data: {
        defaultId: defaultCoachModelId,
        models: allCoachModels.map(({ description, id, label }) => ({
          description,
          id,
          label,
        })),
      },
    },
    200
  );
});
