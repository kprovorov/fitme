// Vercel's Hono preset only accepts an entrypoint that imports "hono" itself.
import "hono";
import { initObservability, reportMissingEnv } from "@fitme/observability/node";
import { REQUIRED_ENV } from "./required-env.js";

initObservability({ service: "mcp" });
// On production, a lost env variable is reported before any request fails on it.
await reportMissingEnv(REQUIRED_ENV);

// Loaded only now, so pg and the rest are imported after observability has
// started and get instrumented (a static import would load them first).
const { createDefaultApp } = await import("./create-app.js");

// Vercel's Hono preset serves the default export of dist/app.js.
export default createDefaultApp();
