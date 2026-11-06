// Prints the PEM public key of a Clerk instance on one line, the value of
// apps/arnold's CLERK_JWT_KEY, which its channel verifies session tokens
// with. Reads the instance's public JWKS, so it needs no credentials.
//
// Usage: clerk-jwt-key [frontend-api-domain]
// The domain defaults to [auth.third_party.clerk] in supabase/config.toml (the
// development instance); pass clerk.fitmeproject.com for production.

import { createPublicKey } from "node:crypto";
import { readFileSync } from "node:fs";

const CLERK_DOMAIN =
  /\[auth\.third_party\.clerk\][^[]*?domain\s*=\s*"(?<domain>[^"]+)"/u;

const configuredDomain = (): string => {
  const config = readFileSync(
    new URL("../supabase/config.toml", import.meta.url),
    "utf-8"
  );

  const domain = CLERK_DOMAIN.exec(config)?.groups?.domain;

  if (domain === undefined || domain === "") {
    throw new Error("No [auth.third_party.clerk] domain in config.toml");
  }

  return domain;
};

const main = async () => {
  const domain = process.argv[2] ?? configuredDomain();
  const response = await fetch(`https://${domain}/.well-known/jwks.json`);

  if (!response.ok) {
    throw new Error(
      `Fetching the JWKS of ${domain} failed with ${response.status}`
    );
  }

  const jwks: unknown = await response.json();

  if (
    !(jwks instanceof Object) ||
    !("keys" in jwks) ||
    !Array.isArray(jwks.keys)
  ) {
    throw new Error(`Expected one key in the JWKS of ${domain}`);
  }

  const keys: unknown[] = jwks.keys;
  // Clerk signs session tokens with a single RS256 instance key.
  const [key] = keys;

  if (keys.length !== 1 || !(key instanceof Object)) {
    throw new Error(`Expected one key in the JWKS of ${domain}`);
  }

  const pem = createPublicKey({
    format: "jwk",
    key: Object.fromEntries(Object.entries(key)),
  })
    .export({ format: "pem", type: "spki" })
    .toString();

  // One line, so it survives `supabase secrets set` and dotenv files; Clerk
  // strips the line breaks before parsing the key anyway.
  console.log(pem.replaceAll("\n", ""));
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
