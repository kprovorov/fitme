import { importJWK, type JWK, SignJWT } from "jose";

/**
 * Supabase access tokens the MCP server signs itself (ADR 0002). Supabase
 * trusts the public half of the signing key, so a token signed here is as
 * good as one Supabase Auth issued: RLS and the RPCs read the caller from its
 * `sub`. The claims are hard-coded; only the User id varies, and it must come
 * from a verified Clerk token, never from tool input or request data.
 */

const ALGORITHM = "ES256";
const AUDIENCE = "authenticated";
const ISSUER = "fitme-mcp";
const ROLE = "authenticated";
/** Upper bound on a signed token's lifetime, in seconds. */
const MAX_LIFETIME_SECONDS = 5 * 60;

export interface SupabaseTokenSignOptions {
  /**
   * Latest expiry allowed, as epoch seconds (e.g. the Clerk token's `exp`).
   * The token expires at the earlier of this and 5 minutes from now.
   */
  expiresAtMost?: number;
}

/** Signs a short-lived Supabase access token for a verified User id. */
export type SupabaseTokenSigner = (
  userId: string,
  options?: SupabaseTokenSignOptions
) => Promise<string>;

const invalidKey = (reason: string) =>
  new Error(
    `SUPABASE_JWT_SIGNING_KEY must be a private ES256 JWK (\`supabase gen signing-key --algorithm ES256\`): ${reason}.`
  );

function parseSigningKey(signingKey: string): JWK & { kid: string } {
  let jwk: JWK;
  try {
    jwk = JSON.parse(signingKey) as JWK;
  } catch {
    // biome-ignore lint/style/useErrorCause: JSON.parse errors quote the input, which is a private key.
    throw invalidKey("it is not valid JSON");
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
    throw invalidKey("it is not a P-256 EC key");
  }
  if (!jwk.d) {
    throw invalidKey("it has no private part (`d`)");
  }
  if (!jwk.kid) {
    throw invalidKey("it has no key id (`kid`)");
  }
  // The Supabase CLI includes these; WebCrypto rejects them for a sign-only
  // import (`key_ops` lists "verify", which a private key can't do).
  const { ext: _ext, key_ops: _keyOps, use: _use, ...key } = jwk;
  return { ...key, kid: jwk.kid };
}

async function importSigningKey(signingKey: string) {
  const jwk = parseSigningKey(signingKey);
  const key = await importJWK(jwk, ALGORITHM);
  if (key instanceof Uint8Array) {
    throw invalidKey("it is a symmetric key");
  }
  return { key, kid: jwk.kid };
}

/**
 * Builds a signer from a private ES256 JWK (the `SUPABASE_JWT_SIGNING_KEY`
 * value). The key is parsed and imported on first use; a malformed key
 * rejects every call.
 */
export function createSupabaseTokenSigner(
  signingKey: string
): SupabaseTokenSigner {
  let imported: ReturnType<typeof importSigningKey> | undefined;

  return async (userId, { expiresAtMost } = {}) => {
    if (!userId) {
      throw new Error("Cannot sign a Supabase token without a User id.");
    }
    imported ??= importSigningKey(signingKey);
    const { key, kid } = await imported;

    const issuedAt = Math.floor(Date.now() / 1000);
    if (expiresAtMost !== undefined && expiresAtMost <= issuedAt) {
      throw new Error(
        "Cannot sign a Supabase token: its expiry upper bound has already passed."
      );
    }
    const expiresAt = Math.min(
      issuedAt + MAX_LIFETIME_SECONDS,
      expiresAtMost ?? Number.POSITIVE_INFINITY
    );

    return new SignJWT({ role: ROLE })
      .setProtectedHeader({ alg: ALGORITHM, kid, typ: "JWT" })
      .setAudience(AUDIENCE)
      .setIssuer(ISSUER)
      .setSubject(userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(key);
  };
}

/**
 * Signer for the `SUPABASE_JWT_SIGNING_KEY` env var, or `null` when it isn't
 * set.
 */
export function supabaseTokenSignerFromEnv(): SupabaseTokenSigner | null {
  const signingKey = process.env.SUPABASE_JWT_SIGNING_KEY;
  return signingKey ? createSupabaseTokenSigner(signingKey) : null;
}

let cachedSigner: { signer: SupabaseTokenSigner; signingKey: string } | null =
  null;

/**
 * `createSupabaseTokenSigner`, reused while the key stays the same, so the
 * HTTP layer imports the key once per process rather than once per request.
 */
export function cachedSupabaseTokenSigner(
  signingKey: string
): SupabaseTokenSigner {
  if (cachedSigner?.signingKey !== signingKey) {
    cachedSigner = {
      signer: createSupabaseTokenSigner(signingKey),
      signingKey,
    };
  }
  return cachedSigner.signer;
}
