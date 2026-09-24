import { serve } from "@hono/node-server";
import { app } from "./app.js";

const DEFAULT_PORT = 3002;

// On Vercel the Hono preset takes the default export and turns it into a
// Vercel Function, so we must not bind a port there. Everywhere else (local
// dev, `pnpm mcp start`) run a plain Node HTTP server.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);

  const server = serve({ fetch: app.fetch, port }, (info) => {
    console.info(`MCP server listening on http://localhost:${info.port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export default app;
