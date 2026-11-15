import { proEntitlement } from "@fitme/core";
import type { CustomerInfo, Store } from "react-native-purchases";

/**
 * Where a Fitme Pro Subscription stands:
 * - `trial`: in its free trial, billing when it ends;
 * - `renewing`: renews on its expiry date;
 * - `cancelled`: won't renew, but active until its expiry date;
 * - `lifetime`: never expires;
 * - `promotional`: a grant no store sells, ending on its expiry date.
 */
export type ProStatus =
  | "cancelled"
  | "lifetime"
  | "promotional"
  | "renewing"
  | "trial";

/** A User's Subscription, worked out from RevenueCat's `customerInfo`. */
export type Subscription =
  | { readonly kind: "free" }
  | {
      readonly kind: "pro";
      readonly status: ProStatus;
      /** When access ends or renews; `null` for `lifetime`. */
      readonly expiresAt: Date | null;
      /** The store's page for managing it; `null` when there's none. */
      readonly managementURL: string | null;
      /** The entitlement's product, for the billing period. */
      readonly productIdentifier: string;
      readonly store: Store;
    };

const FREE: Subscription = { kind: "free" };

const statusOf = (
  entitlement: {
    readonly periodType: string;
    readonly store: Store;
    readonly willRenew: boolean;
  },
  expiresAt: Date | null
): ProStatus => {
  if (expiresAt === null) {
    return "lifetime";
  }

  if (entitlement.store === "PROMOTIONAL") {
    return "promotional";
  }

  if (!entitlement.willRenew) {
    return "cancelled";
  }

  return entitlement.periodType === "TRIAL" ? "trial" : "renewing";
};

/**
 * The User's Subscription from RevenueCat's client `customerInfo`: Fitme Pro
 * while the "Fitme Pro" entitlement is active, Free otherwise (and for no
 * customer at all, as an E2E build reads it). The one place the states are
 * told apart, for the Profile card, the Subscription screen and the delete
 * warning.
 */
export const subscriptionOf = (
  customerInfo: CustomerInfo | null
): Subscription => {
  const entitlement = customerInfo?.entitlements.active[proEntitlement];

  if (!entitlement?.isActive) {
    return FREE;
  }

  const expiresAt =
    entitlement.expirationDate === null
      ? null
      : new Date(entitlement.expirationDate);

  return {
    expiresAt,
    kind: "pro",
    managementURL: customerInfo?.managementURL ?? null,
    productIdentifier: entitlement.productIdentifier,
    status: statusOf(entitlement, expiresAt),
    store: entitlement.store,
  };
};
