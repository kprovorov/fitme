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

const listArnoldModels = (deprecated: boolean) =>
  createRoute({
    ...(deprecated && {
      deprecated: true,
      description:
        "The same list as `GET /v1/arnold/models`, kept for app builds from before the Arnold rename. Use `/v1/arnold/models`.",
    }),
    method: "get",
    path: "/",
    responses: {
      200: {
        content: { "application/json": { schema: ArnoldModels } },
        description: "Every model Arnold accepts, in list order",
        headers: publicCacheHeaders,
      },
    },
    summary: deprecated ? "Arnold models (deprecated)" : "Arnold models",
  });

// Public: the list isn't secret, and Arnold's channel does the real gating.
const arnoldModelsRouter = (deprecated: boolean) =>
  new OpenAPIHono({ defaultHook: invalidRequest }).openapi(
    listArnoldModels(deprecated),
    (c) => {
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
    }
  );

/** `GET /v1/arnold/models`. */
export const arnoldModelsRoute = arnoldModelsRouter(false);

/**
 * `GET /v1/coach/models`: the route installed builds from before the Arnold
 * rename read, answering exactly like `arnoldModelsRoute` until the minimum
 * version gate cuts those builds off.
 */
export const legacyCoachModelsRoute = arnoldModelsRouter(true);
