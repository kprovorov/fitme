import { once } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { createProCheck, PRO_CHECK_TTL_MS } from "../agent/lib/pro-access";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

const iso = (ms: number) => new Date(ms).toISOString();

interface Entitlement {
  expires_date: string | null;
  grace_period_expires_date: string | null;
  product_identifier: string;
  purchase_date: string;
}

/** A RevenueCat v1 subscriber with the given entitlements. */
const subscriber = (entitlements: Record<string, Entitlement> = {}) =>
  Response.json({ subscriber: { entitlements } });

const stalled = async (_url: string, { signal }: RequestInit) => {
  if (!signal) {
    throw new Error("Missing abort signal");
  }

  await once(signal, "abort");
  const reason: unknown = signal.reason;
  throw reason instanceof Error ? reason : new Error("Request aborted");
};

const pro = (expiresAt: number | null = NOW + HOUR_MS) => ({
  "Fitme Pro": {
    expires_date: expiresAt === null ? null : iso(expiresAt),
    grace_period_expires_date: null,
    product_identifier: "fitme_pro_monthly",
    purchase_date: iso(NOW - HOUR_MS),
  },
});

const setup = (respond: () => Response | Promise<Response>) => {
  let now = NOW;

  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (_url: string, _init?: RequestInit) => await respond()
  );

  const check = createProCheck({
    fetch,
    now: () => now,
    secretKey: () => "sk_test_revenuecat",
  });

  return {
    advance: (ms: number) => {
      now += ms;
    },
    check,
    fetch,
  };
};

describe("pro access check", () => {
  it("asks RevenueCat about the User with the secret key", async () => {
    const { check, fetch } = setup(() => subscriber(pro()));

    await expect(check("user_alice")).resolves.toBeTruthy();
    expect(fetch.mock.calls[0]).toMatchObject([
      "https://api.revenuecat.com/v1/subscribers/user_alice",
      {
        headers: {
          authorization: "Bearer sk_test_revenuecat",
        },
      },
    ]);
  });

  it("escapes the User id in the URL", async () => {
    const { check, fetch } = setup(() => subscriber());

    await check("user/../x");

    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://api.revenuecat.com/v1/subscribers/user%2F..%2Fx"
    );
  });

  it("counts a lifetime entitlement as Pro", async () => {
    const { check } = setup(() => subscriber(pro(null)));

    await expect(check("user_alice")).resolves.toBeTruthy();
  });

  it("isn't Pro without the entitlement", async () => {
    const { check } = setup(() =>
      subscriber({ "Other Thing": pro()["Fitme Pro"] })
    );

    await expect(check("user_alice")).resolves.toBeFalsy();
  });

  it("isn't Pro once the entitlement expired", async () => {
    const { check } = setup(() => subscriber(pro(NOW - 1000)));

    await expect(check("user_alice")).resolves.toBeFalsy();
  });

  it("stays Pro during a billing grace period", async () => {
    const { check } = setup(() =>
      subscriber({
        "Fitme Pro": {
          ...pro(NOW - 1000)["Fitme Pro"],
          grace_period_expires_date: iso(NOW + HOUR_MS),
        },
      })
    );

    await expect(check("user_alice")).resolves.toBeTruthy();
  });

  it("throws when RevenueCat answers an error", async () => {
    const { check } = setup(() => new Response("down", { status: 503 }));

    await expect(check("user_alice")).rejects.toThrow("503");
  });

  it("throws when RevenueCat can't be reached", async () => {
    const { check } = setup(() => {
      throw new TypeError("fetch failed");
    });

    await expect(check("user_alice")).rejects.toThrow("fetch failed");
  });

  it("gives up on a RevenueCat request that stalls", async () => {
    const check = createProCheck({
      fetch: stalled,
      secretKey: () => "sk_test_revenuecat",
      timeoutMs: 10,
    });

    await expect(check("user_alice")).rejects.toThrow(
      "The operation was aborted due to timeout"
    );
  });

  it("throws on a body it can't read", async () => {
    const { check } = setup(() => Response.json({ nope: true }));

    await expect(check("user_alice")).rejects.toThrow("subscriber");
  });

  it("throws without a secret key, before calling RevenueCat", async () => {
    const fetch =
      vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

    const check = createProCheck({ fetch, secretKey: () => {} });

    await expect(check("user_alice")).rejects.toThrow("REVENUECAT_SECRET_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caches an answer per User for the window, then asks again", async () => {
    const { advance, check, fetch } = setup(() => subscriber(pro()));

    await check("user_alice");
    advance(PRO_CHECK_TTL_MS - 1);
    await check("user_alice");
    expect(fetch).toHaveBeenCalledOnce();

    await check("user_bob");
    expect(fetch).toHaveBeenCalledTimes(2);

    advance(1);
    await check("user_alice");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("picks up a lapsed subscription once the window passes", async () => {
    let entitlements: Record<string, Entitlement> = pro();
    const { advance, check } = setup(() => subscriber(entitlements));

    await expect(check("user_alice")).resolves.toBeTruthy();
    entitlements = {};
    await expect(check("user_alice")).resolves.toBeTruthy();
    advance(PRO_CHECK_TTL_MS);
    await expect(check("user_alice")).resolves.toBeFalsy();
  });

  it("picks up a new subscription once the window passes", async () => {
    let entitlements: Record<string, Entitlement> = {};
    const { advance, check } = setup(() => subscriber(entitlements));

    await expect(check("user_alice")).resolves.toBeFalsy();
    entitlements = pro();
    advance(PRO_CHECK_TTL_MS);
    await expect(check("user_alice")).resolves.toBeTruthy();
  });

  it("doesn't cache a Pro answer past the entitlement's expiry", async () => {
    const { advance, check } = setup(() => subscriber(pro(NOW + 1000)));

    await expect(check("user_alice")).resolves.toBeTruthy();
    advance(1000);
    await expect(check("user_alice")).resolves.toBeFalsy();
  });

  it("doesn't cache a failure", async () => {
    const answers = [new Response("down", { status: 500 }), subscriber(pro())];
    const { check, fetch } = setup(() => answers.shift() ?? subscriber());

    await expect(check("user_alice")).rejects.toThrow(
      "RevenueCat answered 500"
    );
    await expect(check("user_alice")).resolves.toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
