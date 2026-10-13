import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseTokenSigner } from "../supabase-token.js";
import { SIGNING_KEY } from "./signing-key.js";

const NOW = new Date("2026-10-13T12:00:00Z");
const NOW_SECONDS = NOW.getTime() / 1000;
const USER_ID = "user_2abcDEFghiJKLmnoPQRstuVWxyz";

describe("createSupabaseTokenSigner", () => {
  const sign = createSupabaseTokenSigner(JSON.stringify(SIGNING_KEY));

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("signs an ES256 token Supabase treats as the authenticated User", async () => {
    const token = await sign(USER_ID);

    expect(decodeProtectedHeader(token)).toEqual({
      alg: "ES256",
      kid: SIGNING_KEY.kid,
      typ: "JWT",
    });
    expect(decodeJwt(token)).toEqual({
      aud: "authenticated",
      exp: NOW_SECONDS + 300,
      iat: NOW_SECONDS,
      iss: "fitme-mcp",
      role: "authenticated",
      sub: USER_ID,
    });

    const { d: _private, ...publicKey } = SIGNING_KEY;
    const verified = await jwtVerify(
      token,
      await importJWK({ ...publicKey, key_ops: ["verify"] }, "ES256")
    );
    expect(verified.payload.sub).toBe(USER_ID);
  });

  it("expires after 5 minutes even when the upper bound is later", async () => {
    const token = await sign(USER_ID, { expiresAtMost: NOW_SECONDS + 3600 });
    expect(decodeJwt(token).exp).toBe(NOW_SECONDS + 300);
  });

  it("expires at an earlier upper bound", async () => {
    const token = await sign(USER_ID, { expiresAtMost: NOW_SECONDS + 42 });
    expect(decodeJwt(token).exp).toBe(NOW_SECONDS + 42);
  });

  it("refuses an upper bound that has already passed", async () => {
    await expect(sign(USER_ID, { expiresAtMost: NOW_SECONDS })).rejects.toThrow(
      "already passed"
    );
  });

  it("refuses an empty User id", async () => {
    await expect(sign("")).rejects.toThrow("User id");
  });

  it("refuses a key that is not a private ES256 JWK", async () => {
    const { d: _private, ...publicKey } = SIGNING_KEY;
    const signWithPublicKey = createSupabaseTokenSigner(
      JSON.stringify(publicKey)
    );
    await expect(signWithPublicKey(USER_ID)).rejects.toThrow(
      "SUPABASE_JWT_SIGNING_KEY"
    );
  });
});
