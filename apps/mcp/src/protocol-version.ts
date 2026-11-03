import {
  MAX_BATCH_SIZE,
  readRequestBody,
} from "@modelcontextprotocol/sdk/server/requestBody.js";
import {
  isInitializeRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import type { MiddlewareHandler } from "hono";

/**
 * Whether the request is one to leave to the transport: a body holding an
 * `initialize` request (alone or in a batch), or one it answers itself. The
 * body is read within the transport's own size limit: one over it is the
 * transport's 413, a batch over its message limit its 400 (checked before any
 * message is), and anything that isn't JSON its parse error.
 */
const isForTransport = async (request: Request): Promise<boolean> => {
  try {
    const read = await readRequestBody(request.clone());
    if (read.tooLarge) {
      return true;
    }
    const body: unknown = JSON.parse(read.text);
    if (Array.isArray(body) && body.length > MAX_BATCH_SIZE) {
      return true;
    }
    const messages = Array.isArray(body) ? body : [body];
    return messages.some((message) => isInitializeRequest(message));
  } catch {
    return true;
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
    (c.req.method === "POST" && (await isForTransport(c.req.raw)))
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
