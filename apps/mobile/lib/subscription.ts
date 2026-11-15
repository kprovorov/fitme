import { proEntitlement } from "@fitme/core";
import type { CustomerInfo } from "react-native-purchases";

/**
 * Where a dated Fitme Pro Subscription stands:
 * - `trial`: in its free trial, billing when it ends (a trial the User
 *   cancelled no longer bills, so it's `cancelled`);
 * - `renewing`: renews on its expiry date;
 * - `cancelled`: won't renew, but active until its expiry date;
 * - `promotional`: a grant no store sells, ending on its expiry date.
 */
export type DatedProStatus = "cancelled" | "promotional" | "renewing" | "trial";

/** A Fitme Pro Subscription, `lifetime` (never expires) or dated. */
export type ProSubscription = {
  readonly kind: "pro";
  /** The store's page for managing it; `null` when there's none. */
  readonly managementURL: string | null;
} & (
  | { readonly expiresAt: null; readonly status: "lifetime" }
  | { readonly expiresAt: Date; readonly status: DatedProStatus }
);

/** A User's Subscription, worked out from RevenueCat's `customerInfo`. */
export type Subscription = { readonly kind: "free" } | ProSubscription;

const FREE: Subscription = { kind: "free" };

const datedStatusOf = (entitlement: {
  readonly periodType: string;
  readonly store: string;
  readonly willRenew: boolean;
}): DatedProStatus => {
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
 * told apart.
 */
export const subscriptionOf = (
  customerInfo: CustomerInfo | null
): Subscription => {
  const entitlement = customerInfo?.entitlements.active[proEntitlement];

  if (!(customerInfo && entitlement?.isActive)) {
    return FREE;
  }

  const { managementURL } = customerInfo;

  if (entitlement.expirationDate === null) {
    return { expiresAt: null, kind: "pro", managementURL, status: "lifetime" };
  }

  return {
    expiresAt: new Date(entitlement.expirationDate),
    kind: "pro",
    managementURL,
    status: datedStatusOf(entitlement),
  };
};
