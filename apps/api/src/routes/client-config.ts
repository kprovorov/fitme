import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  invalidRequest,
  PUBLIC_CACHE_CONTROL,
  publicCacheHeaders,
} from "../schemas.js";

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** An `x.y.z` version from env; unset or malformed means no minimum. */
const minimumVersionFromEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value && VERSION_PATTERN.test(value) ? value : null;
};

const MinimumVersion = z.string().nullable().openapi({
  description:
    "The oldest supported app version (`x.y.z`), or `null` for no minimum.",
  example: "1.10.0",
});

const ClientConfig = z
  .object({
    data: z.object({
      minimumVersion: z.object({
        android: MinimumVersion,
        ios: MinimumVersion,
      }),
    }),
  })
  .openapi("ClientConfig");

const getClientConfig = createRoute({
  method: "get",
  path: "/",
  responses: {
    200: {
      content: { "application/json": { schema: ClientConfig } },
      description: "The mobile app's config: its minimum version per platform",
      headers: publicCacheHeaders,
    },
  },
  summary: "Mobile client config",
});

// Public: the mobile app reads it before anyone signs in.
export const clientConfig = new OpenAPIHono({
  defaultHook: invalidRequest,
}).openapi(getClientConfig, (c) => {
  c.header("Cache-Control", PUBLIC_CACHE_CONTROL);
  return c.json(
    {
      data: {
        minimumVersion: {
          android: minimumVersionFromEnv("MIN_APP_VERSION_ANDROID"),
          ios: minimumVersionFromEnv("MIN_APP_VERSION_IOS"),
        },
      },
    },
    200
  );
});
