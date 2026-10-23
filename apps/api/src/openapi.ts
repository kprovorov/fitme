import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "./create-app.js";

/**
 * Writes openapi.json, the API's OpenAPI document, from the zod-openapi route
 * definitions. PR CI fails when the committed document is stale or has a
 * breaking change against the base branch.
 */
const out = resolve(import.meta.dirname, "../openapi.json");
const document = createApp({
  reportError: () => Promise.resolve(),
}).getOpenAPIDocument({
  info: { title: "Fitme API", version: "1.0.0" },
  openapi: "3.0.3",
  servers: [{ url: "https://api.fitmeproject.com" }],
});

await writeFile(out, `${JSON.stringify(document, null, 2)}\n`);
console.log(`generated ${out}`);
