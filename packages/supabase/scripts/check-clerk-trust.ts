// Checks that a Supabase stack trusts Clerk development session tokens:
// creates a throwaway `+clerk_test` user on the Clerk development instance,
// mints a session token for it and sends it to the Supabase Data API. Exits
// non-zero unless the token carries `role: authenticated` and is accepted.
// With API_URL it also sends the token to that Public API (apps/api) and
// exits non-zero unless `GET /v1/profile` answers 200, so the API verifies
// the token and reaches the stack's data as that User.
//
// Env: CLERK_SECRET_KEY (development instance, sk_test_…), SUPABASE_URL,
// SUPABASE_ANON_KEY, API_URL (optional).

import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const CLERK_API_URL = "https://api.clerk.com/v1";

// The API's first database query can fail while the pooler picks up a
// password set moments before, so it gets a few tries.
const API_ATTEMPTS = 5;
const API_RETRY_DELAY_MS = 3000;
const API_TIMEOUT_MS = 10_000;

type ClerkRequestBody =
  | {
      email_address: string[];
      password: string;
      skip_password_checks: boolean;
    }
  | { user_id: string }
  | Record<string, never>;

interface JwtPayload {
  role?: unknown;
}

const isJwtPayload = (value: unknown): value is JwtPayload =>
  typeof value === "object" && value !== null;

const hasClerkField = <Key extends "id" | "jwt">(
  value: unknown,
  key: Key
): value is Record<Key, string> =>
  typeof value === "object" &&
  value !== null &&
  (key === "id"
    ? "id" in value && typeof value.id === "string"
    : "jwt" in value && typeof value.jwt === "string");

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(`Missing ${name} environment variable`);
  }

  return value;
};

const clerkRequest = async (
  secretKey: string,
  method: "POST" | "DELETE",
  path: string,
  body?: ClerkRequestBody
): Promise<Response> => {
  const response = await fetch(`${CLERK_API_URL}${path}`, {
    body: body && JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body && { "Content-Type": "application/json" }),
    },
    method,
  });

  if (!response.ok) {
    throw new Error(
      `Clerk ${method} ${path} failed with ${response.status}: ${await response.text()}`
    );
  }

  return response;
};

const readClerkField = async <Key extends "id" | "jwt">(
  response: Response,
  key: Key
): Promise<Record<Key, string>> => {
  const data: unknown = await response.json();

  if (!hasClerkField(data, key)) {
    throw new Error(`Clerk returned a malformed ${key} response`);
  }

  return data;
};

const decodeJwtPayload = (jwt: string) => {
  const [, payload] = jwt.split(".");

  if (!payload) {
    throw new Error("Clerk returned a malformed session token");
  }

  const claims: unknown = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf-8")
  );

  const role = isJwtPayload(claims) ? claims.role : undefined;

  if (role !== "authenticated") {
    throw new Error(
      `Clerk session token has role ${JSON.stringify(role)}, expected "authenticated". Is the Supabase integration activated on the Clerk instance?`
    );
  }

  return { role };
};

const checkApi = async (
  apiUrl: string,
  jwt: string,
  attempt = 1
): Promise<void> => {
  let failure = "";
  let response: Response | undefined;

  try {
    // A new User has no Profile yet, so the API answers { data: null }.
    response = await fetch(`${apiUrl}/v1/profile`, {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    failure = String(error);
  }

  if (response !== undefined && response.ok) {
    console.log(
      `The Public API at ${apiUrl} accepts Clerk development session tokens and reads the User's data.`
    );

    return;
  }

  if (response !== undefined) {
    failure = `${response.status}: ${await response.text()}`;
  }

  console.error(
    `GET /v1/profile failed with ${failure} (attempt ${attempt}/${API_ATTEMPTS})`
  );

  if (attempt < API_ATTEMPTS) {
    await sleep(API_RETRY_DELAY_MS);

    await checkApi(apiUrl, jwt, attempt + 1);

    return;
  }

  throw new Error(
    `The Public API at ${apiUrl} never answered GET /v1/profile with 200 (last: ${failure})`
  );
};

const main = async () => {
  const secretKey = requireEnv("CLERK_SECRET_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const apiUrl = process.env.API_URL;

  // Sessions can only be created through the Backend API on development
  // instances, and this script must never create users in production.
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("CLERK_SECRET_KEY must be a development key (sk_test_…)");
  }

  const user = await readClerkField(
    await clerkRequest(secretKey, "POST", "/users", {
      email_address: [
        `trust-check-${randomUUID()}+clerk_test@fitmeproject.com`,
      ],
      password: randomUUID(),
      skip_password_checks: true,
    }),
    "id"
  );

  try {
    const session = await readClerkField(
      await clerkRequest(secretKey, "POST", "/sessions", {
        user_id: user.id,
      }),
      "id"
    );

    const { jwt } = await readClerkField(
      await clerkRequest(
        secretKey,
        "POST",
        `/sessions/${session.id}/tokens`,
        // Clerk answers 415 to a POST without a JSON body.
        {}
      ),
      "jwt"
    );

    decodeJwtPayload(jwt);

    // PostgREST rejects a token it cannot verify with 401 and otherwise runs
    // the request as the token's `role` claim, checked above. The test User
    // has no Plans, so RLS answers an empty list.
    const response = await fetch(
      `${supabaseUrl}/rest/v1/plans?select=id&limit=1`,
      { headers: { Authorization: `Bearer ${jwt}`, apikey: anonKey } }
    );

    if (!response.ok) {
      throw new Error(
        `Supabase rejected the Clerk session token with ${response.status}: ${await response.text()}`
      );
    }

    console.log(
      `Supabase at ${supabaseUrl} accepts Clerk development session tokens as authenticated.`
    );

    if (apiUrl !== undefined && apiUrl !== "") {
      await checkApi(apiUrl, jwt);
    }
  } finally {
    // A failed cleanup must not mask the outcome of the check.
    try {
      const response = await clerkRequest(
        secretKey,
        "DELETE",
        `/users/${user.id}`
      );

      await response.json();
    } catch (error) {
      console.error(`Failed to delete Clerk user ${user.id}:`, error);
    }
  }
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
