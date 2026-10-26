import { arnoldModels, defaultArnoldModelId } from "@fitme/core";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  invalidRequest,
  PUBLIC_CACHE_CONTROL,
  publicCacheHeaders,
} from "../schemas.js";

const ArnoldModel = z
  .object({
    description: z.string(),
    id: z.string().openapi({ example: defaultArnoldModelId }),
    label: z.string(),
  })
  .openapi("ArnoldModel");

const ArnoldModels = z
  .object({
    data: z.object({
      defaultId: z.string().openapi({
        description: "The model Arnold uses when a turn names none.",
        example: defaultArnoldModelId,
      }),
      models: z.array(ArnoldModel),
    }),
  })
  .openapi("ArnoldModels");

const listArnoldModels = createRoute({
  method: "get",
  path: "/",
  responses: {
    200: {
      content: { "application/json": { schema: ArnoldModels } },
      description: "Every model Arnold accepts, in list order",
      headers: publicCacheHeaders,
    },
  },
  summary: "Arnold models",
});

/**
 * `GET /v1/arnold/models`. Public: the list isn't secret, and Arnold's channel
 * does the real gating.
 */
export const arnoldModelsRoute = new OpenAPIHono({
  defaultHook: invalidRequest,
}).openapi(listArnoldModels, (c) => {
  c.header("Cache-Control", PUBLIC_CACHE_CONTROL);
  return c.json(
    {
      data: {
        defaultId: defaultArnoldModelId,
        models: arnoldModels.map(({ description, id, label }) => ({
          description,
          id,
          label,
        })),
      },
    },
    200
  );
});
