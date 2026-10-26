// Vercel's Hono preset only accepts an entrypoint that imports "hono" itself.
import "hono";
import { initObservability, reportMissingEnv } from "@fitme/observability/node";
import { REQUIRED_ENV } from "./required-env.js";

initObservability({ service: "api" });
// On production, a lost env variable is reported before any request fails on it.
await reportMissingEnv(REQUIRED_ENV);

// Loaded only now, so the app's modules are imported after observability has
// started and get instrumented (a static import would load them first).
const { createApp } = await import("./create-app.js");

// Vercel's Hono preset serves the default export of dist/app.js. Throws in
// production without Upstash (the rate limiter), so the deployment fails at
// startup instead of serving unlimited.
export default createApp();
