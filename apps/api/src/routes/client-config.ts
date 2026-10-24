import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import {
  invalidRequest,
  PUBLIC_CACHE_CONTROL,
  publicCacheHeaders,
} from "../schemas.js";

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** An `x.y.z` version from env, or `undefined` when unset or malformed. */
const versionFromEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value && VERSION_PATTERN.test(value) ? value : undefined;
};

/**
 * A platform's minimum from `MIN_APP_VERSION_<PLATFORM>`, or from
 * `MIN_APP_VERSION` when that one is unset or malformed (so a typo never
 * lifts the global cutoff); neither valid means no minimum.
 */
const minimumVersionFromEnv = (platform: "ANDROID" | "IOS" | "WEB") =>
  versionFromEnv(`MIN_APP_VERSION_${platform}`) ??
  versionFromEnv("MIN_APP_VERSION") ??
  null;

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
        web: MinimumVersion,
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
      description: "The client config: the minimum app version per platform",
      headers: publicCacheHeaders,
    },
  },
  summary: "Client config",
});

// Public: the clients read it before anyone signs in.
export const clientConfig = new OpenAPIHono({
  defaultHook: invalidRequest,
}).openapi(getClientConfig, (c) => {
  c.header("Cache-Control", PUBLIC_CACHE_CONTROL);
  return c.json(
    {
      data: {
        minimumVersion: {
          android: minimumVersionFromEnv("ANDROID"),
          ios: minimumVersionFromEnv("IOS"),
          web: minimumVersionFromEnv("WEB"),
        },
      },
    },
    200
  );
});
