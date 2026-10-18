import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "./create-app";
import { memoryRateLimiter } from "./rate-limit";
import { PLACEHOLDER_SUPABASE_URL, serveLibrary } from "./served-library";

/**
 * Writes openapi.json, the Exercise Library API's OpenAPI spec, from the
 * zod-openapi route definitions. The spec doesn't depend on the content, so
 * the app serves an empty Exercise Library and accepts no caller. PR CI fails when the committed
 * spec is stale or has a breaking change against the base branch.
 */
const out = resolve(import.meta.dirname, "../openapi.json");
const library = serveLibrary({ exercises: [] }, PLACEHOLDER_SUPABASE_URL);
const spec = createApp({
  auth: { clerkJwtKeys: {}, serverSecrets: {} },
  library,
  rateLimiter: memoryRateLimiter(),
  reportError: () => Promise.resolve(),
}).getOpenAPIDocument({
  info: { title: "Exercise Library API", version: "1.0.0" },
  openapi: "3.0.3",
  servers: [{ url: "https://exercises.fitmeproject.com" }],
});

await writeFile(out, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`generated ${out}`);
