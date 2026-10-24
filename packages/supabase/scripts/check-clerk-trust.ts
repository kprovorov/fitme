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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

async function clerkRequest<T>(
  secretKey: string,
  method: "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
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
  return (await response.json()) as T;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  if (!payload) {
    throw new Error("Clerk returned a malformed session token");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
}

async function checkApi(apiUrl: string, jwt: string) {
  let failure = "";
  for (let attempt = 1; attempt <= API_ATTEMPTS; attempt += 1) {
    // A new User has no Profile yet, so the API answers { data: null }.
    // biome-ignore lint/performance/noAwaitInLoops: retries, one at a time
    const response = await fetch(`${apiUrl}/v1/profile`, {
      headers: { Authorization: `Bearer ${jwt}` },
    }).catch((error: unknown) => error);
    if (response instanceof Response && response.ok) {
      console.log(
        `The Public API at ${apiUrl} accepts Clerk development session tokens and reads the User's data.`
      );
      return;
    }
    failure =
      response instanceof Response
        ? `${response.status}: ${await response.text()}`
        : String(response);
    console.error(
      `GET /v1/profile failed with ${failure} (attempt ${attempt}/${API_ATTEMPTS})`
    );
    if (attempt < API_ATTEMPTS) {
      await sleep(API_RETRY_DELAY_MS);
    }
  }
  throw new Error(
    `The Public API at ${apiUrl} never answered GET /v1/profile with 200 (last: ${failure})`
  );
}

async function main() {
  const secretKey = requireEnv("CLERK_SECRET_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");
  const apiUrl = process.env.API_URL;

  // Sessions can only be created through the Backend API on development
  // instances, and this script must never create users in production.
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("CLERK_SECRET_KEY must be a development key (sk_test_…)");
  }

  const user = await clerkRequest<{ id: string }>(secretKey, "POST", "/users", {
    email_address: [`trust-check-${randomUUID()}+clerk_test@fitmeproject.com`],
    password: randomUUID(),
    skip_password_checks: true,
  });

  try {
    const session = await clerkRequest<{ id: string }>(
      secretKey,
      "POST",
      "/sessions",
      { user_id: user.id }
    );
    const { jwt } = await clerkRequest<{ jwt: string }>(
      secretKey,
      "POST",
      `/sessions/${session.id}/tokens`,
      // Clerk answers 415 to a POST without a JSON body.
      {}
    );

    const { role } = decodeJwtPayload(jwt);
    if (role !== "authenticated") {
      throw new Error(
        `Clerk session token has role ${JSON.stringify(role)}, expected "authenticated". Is the Supabase integration activated on the Clerk instance?`
      );
    }

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

    if (apiUrl) {
      await checkApi(apiUrl, jwt);
    }
  } finally {
    // A failed cleanup must not mask the outcome of the check.
    await clerkRequest(secretKey, "DELETE", `/users/${user.id}`).catch((err) =>
      console.error(`Failed to delete Clerk user ${user.id}:`, err)
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
