import { AuthenticationError, type ToolContext } from "./context.js";
import { PUBLIC_TOOL_NAMES } from "./tools/catalog.js";

/**
 * MCP authorization (OAuth 2.1). This server is the protected resource; the
 * authorization server is Supabase Auth's OAuth server, so clients register,
 * sign the user in (through the web app's consent page) and refresh tokens
 * there. Access tokens are ordinary Supabase user JWTs.
 */

/** RFC 9728 metadata for a resource served at the root path. */
export const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource";

/**
 * Canonical URI of this MCP server (the endpoint is the root path).
 * `publicUrl` (MCP_PUBLIC_URL) overrides the request URL behind proxies.
 */
export const resourceUrl = (requestUrl: string, publicUrl?: string) =>
  new URL("/", publicUrl || requestUrl).href;

export const protectedResourceMetadata = (
  resource: string,
  authorizationServer: string
) => ({
  authorization_servers: [authorizationServer],
  bearer_methods_supported: ["header"],
  resource,
  resource_name: "Fitme",
});

interface JsonRpcRequestLike {
  method?: unknown;
  params?: { name?: unknown } | null;
}

const isUserToolCall = (message: unknown) => {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const { method, params } = message as JsonRpcRequestLike;
  const name = params?.name;
  return (
    method === "tools/call" &&
    typeof name === "string" &&
    !PUBLIC_TOOL_NAMES.includes(name)
  );
};

/**
 * Whether a JSON-RPC payload (single message or batch) calls a tool that acts
 * on user data. Everything else (initialize, tools/list, public tools) works
 * without signing in.
 */
export const callsUserTool = (body: unknown) =>
  Array.isArray(body) ? body.some(isUserToolCall) : isUserToolCall(body);

/**
 * Verifies the caller up front. Returns the failure when the credentials are
 * missing or rejected; other errors (not configured, Supabase unreachable)
 * are left for the tool to report, since a new token would not help.
 */
export async function authenticate(
  context: ToolContext
): Promise<AuthenticationError | null> {
  try {
    await context.getUserContext();
    return null;
  } catch (error) {
    return error instanceof AuthenticationError ? error : null;
  }
}

/** Characters RFC 6750 allows inside `error_description`. */
const NON_DESCRIPTION_CHARS = /[^\x20\x21\x23-\x5B\x5D-\x7E]/g;

/**
 * 401 with the `WWW-Authenticate` challenge MCP clients use to discover the
 * authorization server and start (or, for an expired token, refresh) OAuth.
 */
export function unauthorizedResponse(
  error: AuthenticationError,
  resourceMetadataUrl: string
): Response {
  const description = error.message.replace(NON_DESCRIPTION_CHARS, "");
  // RFC 6750: a request without credentials gets no error code.
  const params =
    error.reason === "invalid"
      ? [`error="invalid_token"`, `error_description="${description}"`]
      : [];
  params.push(`resource_metadata="${resourceMetadataUrl}"`);

  return Response.json(
    { error: "invalid_token", error_description: error.message },
    {
      headers: { "WWW-Authenticate": `Bearer ${params.join(", ")}` },
      status: 401,
    }
  );
}
