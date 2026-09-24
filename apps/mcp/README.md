# @fitme/mcp

Streamable HTTP [MCP](https://modelcontextprotocol.io) server exposing Fitme domain data from `@fitme/core`. Deployed at https://mcp.fitmeproject.com.

```bash
pnpm dev:mcp            # tsx watch, http://localhost:3002
pnpm mcp build          # tsdown bundle → dist/
pnpm mcp start          # runs dist/index.js
```

The MCP endpoint is the root path: `POST|GET|DELETE /` (stateless, no session ids). `GET /health` for liveness.

Connect from a client, e.g. Claude Code:

```bash
claude mcp add --transport http fitme https://mcp.fitmeproject.com
```

## Deployment (Vercel)

The `fitme-mcp` Vercel project uses the Hono preset with root directory `apps/mcp`. `vercel.json` sets `outputDirectory` to `dist`, so Vercel takes the tsdown bundle (`dist/index.js`) as the function entrypoint instead of compiling `src/` itself. That matters because `@fitme/core` is a source-only workspace package: it must be inlined by tsdown (`deps.alwaysBundle`) rather than resolved from `node_modules` at runtime.

`src/index.ts` exports the Hono app as default (what the Vercel preset consumes) and only starts a Node HTTP listener when `VERCEL` is unset.
