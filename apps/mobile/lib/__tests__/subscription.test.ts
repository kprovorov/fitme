import { describe, expect, it } from "@jest/globals";

import { billingPeriodOf, billingStoreOf } from "~/lib/subscription";
import type { ProSubscription } from "~/lib/subscription";

const proOn = (store: string): ProSubscription => ({
  expiresAt: new Date("2026-11-30T12:00:00.000Z"),
  kind: "pro",
  managementURL: null,
  productIdentifier: "fitme_pro_yearly",
  status: "renewing",
  store,
});

describe("billingPeriodOf", () => {
  it.each([
    ["P1W", "weekly"],
    ["P7D", "weekly"],
    ["P1M", "monthly"],
    ["P2M", "twoMonths"],
    ["P3M", "threeMonths"],
    ["P6M", "sixMonths"],
    ["P1Y", "yearly"],
    ["P12M", "yearly"],
  ] as const)("names %s as %s", (period, name) => {
    expect(billingPeriodOf(period)).toBe(name);
  });

  it.each([null, undefined, "", "P5D"])("names no period for %p", (period) => {
    expect(billingPeriodOf(period)).toBeNull();
  });
});

describe("billingStoreOf", () => {
  it.each([
    ["APP_STORE", "appStore"],
    ["MAC_APP_STORE", "appStore"],
    ["PLAY_STORE", "playStore"],
    ["PROMOTIONAL", null],
    ["STRIPE", null],
  ] as const)("names %s as %p", (store, name) => {
    expect(billingStoreOf(proOn(store))).toBe(name);
  });
});
