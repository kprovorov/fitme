import {
  isInitializeRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import type { MiddlewareHandler } from "hono";

/** A body holding an `initialize` request (alone or in a batch). */
const isInitialization = async (request: Request): Promise<boolean> => {
  try {
    const body: unknown = await request.clone().json();
    const messages = Array.isArray(body) ? body : [body];
    return messages.some((message) => isInitializeRequest(message));
  } catch {
    // Not JSON: the transport answers its own parse error
    return false;
  }
};

/**
 * Answers a request whose `Mcp-Protocol-Version` the SDK doesn't support with
 * the transport's own 400, before the transport sees it. The transport raises
 * it through `onerror`, which Sentry's MCP integration reports as an unhandled
 * error, although it's the client's version negotiation: a client on a newer
 * revision (2026-07-28) tries it first and falls back on this answer. An
 * `initialize` request goes through: the SDK negotiates its version from the
 * body, whatever the header says.
 */
export const answerUnsupportedProtocolVersion: MiddlewareHandler = async (
  c,
  next
) => {
  const version = c.req.header("mcp-protocol-version");
  const unsupported =
    version !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(version);
  if (
    !unsupported ||
    (c.req.method === "POST" && (await isInitialization(c.req.raw)))
  ) {
    await next();
    return;
  }
  const message = `Bad Request: Unsupported protocol version: ${version} (supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(", ")})`;
  return c.json(
    { error: { code: -32_000, message }, id: null, jsonrpc: "2.0" },
    400
  );
};
