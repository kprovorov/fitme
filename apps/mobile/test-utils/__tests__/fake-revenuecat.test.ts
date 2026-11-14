/**
 * The fake RevenueCat customer through what the app reads it with: the real
 * `useIsProQuery` and `useCustomerInfoQuery` over `react-native-purchases`,
 * and `restorePurchases` / `getProducts` as the Subscription screen will
 * call them.
 */
import { proEntitlement } from "@fitme/core";
import { describe, expect, it, jest } from "@jest/globals";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import { createElement } from "react";
import type { ReactNode } from "react";
import Purchases from "react-native-purchases";

import { useCustomerInfoQuery, useIsProQuery } from "~/hooks/revenueCat";
import { fakeRevenueCat } from "~/test-utils/fake-revenuecat";
import { createTestQueryClient, settle } from "~/test-utils/query-client";

jest.mock(
  "react-native-purchases",
  () =>
    jest.requireActual<typeof import("~/test-utils/fake-revenuecat")>(
      "~/test-utils/fake-revenuecat"
    ).purchasesModule
);

/** Reads both queries the way a screen does, once settled. */
const readCustomer = async () => {
  const client = createTestQueryClient();

  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);

  const { result } = await renderHook(
    () => ({ info: useCustomerInfoQuery(), isPro: useIsProQuery() }),
    { wrapper }
  );

  await settle(client);

  return result.current;
};

/** What a call rejected with, or `null` when it resolved. */
const rejection = async (call: Promise<unknown>): Promise<unknown> => {
  try {
    await call;

    return null;
  } catch (error) {
    return error;
  }
};

describe("fake RevenueCat customer", () => {
  it("is a free customer by default", async () => {
    const { info, isPro } = await readCustomer();

    expect(isPro.data).toBe(false);
    expect(info.data?.entitlements.active).toEqual({});
    expect(info.data?.managementURL).toBeNull();
  });

  it("answers a renewing Pro customer with its product's billing period", async () => {
    fakeRevenueCat.setPro("renewing");
    const { info, isPro } = await readCustomer();

    expect(isPro.data).toBe(true);
    const entitlement = info.data?.entitlements.active[proEntitlement];
    expect(entitlement).toMatchObject({
      isActive: true,
      periodType: "NORMAL",
      productIdentifier: "fitme_pro_yearly",
      store: "APP_STORE",
      willRenew: true,
    });
    expect(info.data?.managementURL).toBe(
      "https://apps.apple.com/account/subscriptions"
    );
    // Renewing in the future, whatever today is.
    expect(entitlement?.expirationDateMillis ?? 0).toBeGreaterThan(Date.now());

    const [product] = await Purchases.getProducts([
      entitlement?.productIdentifier ?? "",
    ]);

    expect(product?.subscriptionPeriod).toBe("P1Y");
  });

  it.each([
    ["trial", { periodType: "TRIAL", willRenew: true }],
    ["cancelled", { periodType: "NORMAL", willRenew: false }],
    [
      "lifetime",
      {
        expirationDate: null,
        productIdentifier: "fitme_pro_lifetime",
        willRenew: false,
      },
    ],
    [
      "promotional",
      { productIdentifier: "rc_promo_fitme_pro_yearly", store: "PROMOTIONAL" },
    ],
  ] as const)("answers a %s Pro customer", async (state, expected) => {
    fakeRevenueCat.setPro(state);
    const { info, isPro } = await readCustomer();

    expect(isPro.data).toBe(true);
    expect(info.data?.entitlements.active[proEntitlement]).toMatchObject(
      expected
    );
  });

  it("takes a state's billing period, store, expiry and management URL", async () => {
    fakeRevenueCat.setPro("renewing", {
      billingPeriod: "P1M",
      expiresAt: "2026-12-01T09:00:00.000Z",
      managementURL: "https://play.google.com/store/account/subscriptions",
      store: "PLAY_STORE",
    });
    const { info } = await readCustomer();
    const entitlement = info.data?.entitlements.active[proEntitlement];

    expect(entitlement).toMatchObject({
      expirationDate: "2026-12-01T09:00:00.000Z",
      productIdentifier: "fitme_pro_monthly",
      store: "PLAY_STORE",
    });
    expect(info.data?.managementURL).toBe(
      "https://play.google.com/store/account/subscriptions"
    );
    const [product] = await Purchases.getProducts(["fitme_pro_monthly"]);
    expect(product?.subscriptionPeriod).toBe("P1M");
  });

  it("sells the subscriptions and the lifetime product, never a promotional grant", async () => {
    fakeRevenueCat.setPro("promotional");

    const products = await Purchases.getProducts([
      "fitme_pro_monthly",
      "fitme_pro_lifetime",
      "rc_promo_fitme_pro_yearly",
    ]);

    expect(
      products.map(({ identifier, priceString, subscriptionPeriod }) => [
        identifier,
        subscriptionPeriod,
        priceString,
      ])
    ).toEqual([
      ["fitme_pro_monthly", "P1M", "$9.99"],
      ["fitme_pro_lifetime", null, "$149.99"],
    ]);
  });

  it("fails every read until the customer is set again", async () => {
    fakeRevenueCat.failReads();
    const { info, isPro } = await readCustomer();

    expect(isPro.isError).toBe(true);
    expect(info.error).toMatchObject({ code: "10" });

    fakeRevenueCat.setFree();
    const again = await readCustomer();
    expect(again.isPro.data).toBe(false);
  });

  it("records a restore, and fails one on demand", async () => {
    fakeRevenueCat.setPro("lifetime");

    const restored = await Purchases.restorePurchases();
    expect(restored.entitlements.active[proEntitlement]).toBeDefined();

    fakeRevenueCat.failNextRestore();
    await expect(
      rejection(Purchases.restorePurchases())
    ).resolves.toMatchObject({
      code: "10",
    });
    expect(fakeRevenueCat.restores).toBe(2);
  });

  it("tells the customer info listeners when the customer changes", () => {
    const listener = jest.fn();
    Purchases.addCustomerInfoUpdateListener(listener);

    fakeRevenueCat.setPro("trial");
    Purchases.removeCustomerInfoUpdateListener(listener);
    fakeRevenueCat.setFree();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        entitlements: expect.objectContaining({
          active: { [proEntitlement]: expect.anything() },
        }),
      })
    );
  });
});
