import { serve } from "@hono/node-server";
import app from "./app";

const DEFAULT_PORT = 3006;
const port = Number(process.env.PORT ?? DEFAULT_PORT);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.info(
    `Exercise Library API listening on http://localhost:${info.port}`
  );
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
