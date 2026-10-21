// Vercel's Hono preset only accepts an entrypoint that imports "hono" itself.
import "hono";
import { initObservability } from "@fitme/observability/node";

initObservability({ service: "webhooks" });

// Loaded only now, so pg and the rest are imported after observability has
// started and get instrumented (a static import would load them first).
const { createApp } = await import("./create-app.js");

// Vercel's Hono preset serves the default export of dist/app.js.
export default createApp();
