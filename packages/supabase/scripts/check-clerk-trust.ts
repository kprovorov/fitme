// Checks that a Supabase stack trusts Clerk development session tokens:
// creates a throwaway `+clerk_test` user on the Clerk development instance,
// mints a session token for it and sends it to the Supabase Data API. Exits
// non-zero unless the token carries `role: authenticated` and is accepted.
//
// Env: CLERK_SECRET_KEY (development instance, sk_test_…), SUPABASE_URL,
// SUPABASE_ANON_KEY.

import { randomUUID } from "node:crypto";

const CLERK_API_URL = "https://api.clerk.com/v1";

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

async function main() {
  const secretKey = requireEnv("CLERK_SECRET_KEY");
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

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
      `/sessions/${session.id}/tokens`
    );

    const { role } = decodeJwtPayload(jwt);
    if (role !== "authenticated") {
      throw new Error(
        `Clerk session token has role ${JSON.stringify(role)}, expected "authenticated". Is the Supabase integration activated on the Clerk instance?`
      );
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/exercises?select=id&limit=1`,
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
  } finally {
    await clerkRequest(secretKey, "DELETE", `/users/${user.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
