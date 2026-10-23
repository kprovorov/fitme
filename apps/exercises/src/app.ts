// Vercel's Hono preset only accepts an entrypoint that imports "hono" itself,
// and dist/app.js otherwise imports only @hono/zod-openapi and hono/* subpaths.
import "hono";
import {
  identifyUser,
  initObservability,
  reportError,
} from "@fitme/observability/node";

initObservability({ service: "exercises" });

// Loaded only now, so the rest is imported after observability has started
// and gets instrumented (a static import would load it first).
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
    serverSecrets: {
      api: process.env.EXERCISES_API_SECRET,
      coach: process.env.EXERCISES_COACH_SECRET,
      mcp: process.env.EXERCISES_MCP_SECRET,
    },
  },
  identifyUser,
  library,
  // Throws in production without Upstash, so the deployment fails at startup.
  rateLimiter: rateLimiterFromEnv(process.env),
  reportError,
});
