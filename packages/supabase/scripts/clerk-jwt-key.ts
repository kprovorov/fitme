// Prints the PEM public key of a Clerk instance on one line, the value of
// apps/coach's CLERK_JWT_KEY, which its channel verifies session tokens
// with. Reads the instance's public JWKS, so it needs no credentials.
//
// Usage: clerk-jwt-key [frontend-api-domain]
// The domain defaults to [auth.third_party.clerk] in supabase/config.toml (the
// development instance); pass clerk.fitmeproject.com for production.

import { createPublicKey, type JsonWebKey } from "node:crypto";
import { readFileSync } from "node:fs";

const CLERK_DOMAIN = /\[auth\.third_party\.clerk\][^[]*?domain\s*=\s*"([^"]+)"/;

function configuredDomain(): string {
  const config = readFileSync(
    new URL("../supabase/config.toml", import.meta.url),
    "utf-8"
  );
  const domain = config.match(CLERK_DOMAIN)?.[1];
  if (!domain) {
    throw new Error("No [auth.third_party.clerk] domain in config.toml");
  }
  return domain;
}

async function main() {
  const domain = process.argv[2] ?? configuredDomain();
  const response = await fetch(`https://${domain}/.well-known/jwks.json`);
  if (!response.ok) {
    throw new Error(
      `Fetching the JWKS of ${domain} failed with ${response.status}`
    );
  }
  const { keys } = (await response.json()) as { keys: JsonWebKey[] };
  // Clerk signs session tokens with a single RS256 instance key.
  const [key] = keys;
  if (keys.length !== 1 || !key) {
    throw new Error(`Expected one key in the JWKS of ${domain}`);
  }
  const pem = createPublicKey({ format: "jwk", key })
    .export({ format: "pem", type: "spki" })
    .toString();
  // One line, so it survives `supabase secrets set` and dotenv files; Clerk
  // strips the line breaks before parsing the key anyway.
  console.log(pem.replaceAll("\n", ""));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
