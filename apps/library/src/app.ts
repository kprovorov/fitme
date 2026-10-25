// Vercel's Hono preset only accepts an entrypoint that imports "hono" itself,
// and dist/app.js otherwise imports only @hono/zod-openapi and hono/* subpaths.
import "hono";
import {
  identifyUser,
  initObservability,
  reportError,
} from "@fitme/observability/node";

initObservability({ service: "library" });

// Loaded only now, so the rest is imported after observability has started
// and gets instrumented (a static import would load it first).
const { serverSecretsFromEnv } = await import("./auth");
const { createApp } = await import("./create-app");
const { library } = await import("./generated/library");
const { rateLimiterFromEnv } = await import("./rate-limit");

// Vercel's Hono preset serves the default export of dist/app.js.
export default createApp({
  auth: {
    clerkJwtKeys: {
      development: process.env.CLERK_JWT_KEY_DEVELOPMENT,
      production: process.env.CLERK_JWT_KEY_PRODUCTION,
    },
    serverSecrets: serverSecretsFromEnv(process.env),
  },
  identifyUser,
  library,
  // Throws in production without Upstash, so the deployment fails at startup.
  rateLimiter: rateLimiterFromEnv(process.env),
  reportError,
});
