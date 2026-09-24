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
