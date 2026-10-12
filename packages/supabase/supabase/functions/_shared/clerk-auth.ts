import { verifyToken } from "npm:@clerk/backend@^3";
import { TokenVerificationError } from "npm:@clerk/backend@^3/errors";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@^2";
import { corsHeaders } from "npm:@supabase/supabase-js@^2/cors";

// The one place edge functions authenticate a User. The gateway's JWT check
// (`verify_jwt`) only accepts tokens signed with the project's own keys, so it
// is off for these functions and this helper verifies the Clerk session token
// instead: networkless, against the Clerk JWT public key in `CLERK_JWT_KEY`.
// Tokens that are missing, expired, or signed by anyone else (including
// Supabase Auth) get a 401 before the handler runs.

export interface UserContext {
  /** The verified Clerk session token. */
  accessToken: string;
  /** RLS-scoped client sending the Clerk token; Postgres reads `sub` from it. */
  supabase: SupabaseClient;
  /** Service-role client that bypasses RLS. Only for work RLS cannot express. */
  supabaseAdmin: SupabaseClient;
  /** The Clerk User id, the token's `sub` claim. */
  userId: string;
}

type UserHandler = (req: Request, ctx: UserContext) => Promise<Response>;

const BEARER = /^Bearer\s+(\S+)$/i;

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

// Edge functions get the new API keys as JSON maps (`SUPABASE_PUBLISHABLE_KEYS`,
// `SUPABASE_SECRET_KEYS`); fall back to the legacy single keys where those are
// absent (local stacks, older projects).
function apiKey(keysVar: string, legacyVar: string): string {
  const keys = Deno.env.get(keysVar);
  if (keys) {
    const parsed: Partial<Record<string, string>> = JSON.parse(keys);
    const key = parsed.default ?? Object.values(parsed)[0];
    if (key) {
      return key;
    }
  }
  return requireEnv(legacyVar);
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

async function verifyUser(req: Request): Promise<UserContext | null> {
  const match = req.headers.get("Authorization")?.match(BEARER);
  const accessToken = match?.[1];
  if (!accessToken) {
    return null;
  }

  const jwtKey = requireEnv("CLERK_JWT_KEY");
  let userId: string;
  try {
    // Checks the signature, `exp`, `nbf` and `iat`, and requires a `sub`.
    ({ sub: userId } = await verifyToken(accessToken, { jwtKey }));
  } catch (error) {
    if (error instanceof TokenVerificationError) {
      return null;
    }
    throw error;
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  return {
    accessToken,
    supabase: createClient(
      supabaseUrl,
      apiKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"),
      { accessToken: async () => accessToken }
    ),
    supabaseAdmin: createClient(
      supabaseUrl,
      apiKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { autoRefreshToken: false, persistSession: false } }
    ),
    userId,
  };
}

/**
 * Wraps an edge function handler so it only runs for a User holding a valid
 * Clerk session token. Answers CORS preflights and adds CORS headers to every
 * response.
 */
export function withClerkUser(
  handler: UserHandler
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }
    try {
      const ctx = await verifyUser(req);
      return withCors(ctx ? await handler(req, ctx) : unauthorized());
    } catch (error) {
      console.error(error);
      return withCors(
        Response.json({ error: "Internal server error" }, { status: 500 })
      );
    }
  };
}
