import { generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";

/**
 * A stand-in for a Clerk instance's signing key: the API only ever sees its
 * PEM public half, like CLERK_JWT_KEY.
 */
export const clerkInstance = () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  return {
    jwtKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
    privateKey,
  };
};

interface ClerkTokenHeader {
  alg: string;
  cat: string;
  kid: string;
  typ: string;
}

interface ClerkSessionClaims {
  exp?: number;
  iat?: number;
  iss?: string;
  nbf?: number;
  sid?: string;
  sub?: string;
}

const base64url = (value: ClerkTokenHeader | ClerkSessionClaims) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

// The `cat` header Clerk puts on every session token; @clerk/backend 3.27+ refuses one without it.
const SESSION_TOKEN_CATEGORY = "cl_B7d4PD111AAA";

const now = () => Math.floor(Date.now() / 1000);

/** A Clerk session token signed with `privateKey`; `claims` override the defaults. */
export const clerkToken = (
  privateKey: KeyObject,
  claims: ClerkSessionClaims
) => {
  const unsigned = `${base64url({ alg: "RS256", cat: SESSION_TOKEN_CATEGORY, kid: "ins_test", typ: "JWT" })}.${base64url(
    {
      exp: now() + 60,
      iat: now() - 5,
      iss: "https://clerk.test",
      nbf: now() - 5,
      sid: "sess_test",
      ...claims,
    }
  )}`;

  const signature = sign("RSA-SHA256", Buffer.from(unsigned), privateKey);

  return `${unsigned}.${signature.toString("base64url")}`;
};
