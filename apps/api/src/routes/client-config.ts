import { Hono } from "hono";

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** How long clients and the CDN may reuse the config, in seconds. */
const MAX_AGE_SECONDS = 300;

/** An `x.y.z` version from env; unset or malformed means no minimum. */
const minimumVersionFromEnv = (name: string) => {
  const value = process.env[name]?.trim();
  return value && VERSION_PATTERN.test(value) ? value : null;
};

export const clientConfig = new Hono();

// Public: the mobile app reads it before anyone signs in.
clientConfig.get("/", (c) => {
  c.header(
    "Cache-Control",
    `public, max-age=${MAX_AGE_SECONDS}, s-maxage=${MAX_AGE_SECONDS}`
  );
  return c.json({
    data: {
      minimumVersion: {
        android: minimumVersionFromEnv("MIN_APP_VERSION_ANDROID"),
        ios: minimumVersionFromEnv("MIN_APP_VERSION_IOS"),
      },
    },
  });
});
