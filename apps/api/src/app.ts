// Vercel's Hono preset only accepts an entrypoint that imports "hono" itself.
import "hono";
import { initObservability } from "@fitme/observability/node";

initObservability({ service: "api" });

// Loaded only now, so the app's modules are imported after observability has
// started and get instrumented (a static import would load them first).
const { createApp } = await import("./create-app.js");

// Vercel's Hono preset serves the default export of dist/app.js. Throws in
// production without Upstash (the rate limiter), so the deployment fails at
// startup instead of serving unlimited.
export default createApp();
