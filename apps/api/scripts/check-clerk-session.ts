// Checks that this Public API accepts a Clerk development session token and
// reads the caller's data as that User: creates a throwaway `+clerk_test` User
// on the Clerk development instance, mints a session token for it and sends it
// to `GET /v1/profile`. Exits non-zero unless the API answers 200 (a new User
// has no Profile yet, so the answer is `{ data: null }`), which proves the API
// verified the token against CLERK_JWT_KEY and reached the database as that
// User through asUser.
//
// The E2E workflow runs it against the API it started on the runner, over a
// Supabase preview branch. It replaced packages/supabase's Clerk third-party
// trust check, which sent the same token to the Data API as well; that API is
// closed (FIT-551, ADR 0019) and the Public API is the only door left.
//
// Env: CLERK_SECRET_KEY (development instance, sk_test_…), API_URL.

import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const CLERK_API_URL = "https://api.clerk.com/v1";

// The API's first database query can fail while the pooler picks up a
// password set moments before, so it gets a few tries.
const ATTEMPTS = 5;
const RETRY_DELAY_MS = 3000;
const TIMEOUT_MS = 10_000;

type ClerkRequestBody =
  | {
      email_address: string[];
      password: string;
      skip_password_checks: boolean;
    }
  | { user_id: string }
  | Record<string, never>;

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

const checkApi = async (
  apiUrl: string,
  jwt: string,
  attempt = 1
): Promise<void> => {
  let failure = "";
  let response: Response | undefined;

  try {
    response = await fetch(`${apiUrl}/v1/profile`, {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
    `GET /v1/profile failed with ${failure} (attempt ${attempt}/${ATTEMPTS})`
  );

  if (attempt >= ATTEMPTS) {
    throw new Error(
      `The Public API at ${apiUrl} never answered GET /v1/profile with 200 (last: ${failure})`
    );
  }

  await sleep(RETRY_DELAY_MS);

  await checkApi(apiUrl, jwt, attempt + 1);
};

const main = async () => {
  const secretKey = requireEnv("CLERK_SECRET_KEY");
  const apiUrl = requireEnv("API_URL");

  // Sessions can only be created through the Backend API on development
  // instances, and this script must never create users in production.
  if (!secretKey.startsWith("sk_test_")) {
    throw new Error("CLERK_SECRET_KEY must be a development key (sk_test_…)");
  }

  const user = await readClerkField(
    await clerkRequest(secretKey, "POST", "/users", {
      email_address: [
        `session-check-${randomUUID()}+clerk_test@fitmeproject.com`,
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

    await checkApi(apiUrl, jwt);
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
