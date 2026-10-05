import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createMcpServer } from "./server.js";

const app = new Hono();

app.use(logger());
app.use(
  cors({
    allowHeaders: [
      "Content-Type",
      "Accept",
      "Mcp-Session-Id",
      "Mcp-Protocol-Version",
    ],
    exposeHeaders: ["Mcp-Session-Id"],
    origin: "*",
  })
);

app.get("/health", (c) => c.json({ ok: true }));

// The MCP endpoint lives at the root so the server is reachable directly at
// https://mcp.fitmeproject.com. Stateless streamable HTTP: a fresh server +
// transport per request, so the process can scale without sticky sessions.
app.all("/", async (c) => {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// Vercel's Hono preset serves the default export of dist/app.js.
export default app;
