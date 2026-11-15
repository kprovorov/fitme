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
  /** The product the entitlement was bought as (or granted under). */
  readonly productIdentifier: string;
  /** Google Play's base plan of that product; `null` on the App Store. */
  readonly productPlanIdentifier: string | null;
  /** Where it's billed: RevenueCat's store (`APP_STORE`, `PROMOTIONAL`…). */
  readonly store: string;
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

  const pro = {
    kind: "pro",
    managementURL: customerInfo.managementURL,
    productIdentifier: entitlement.productIdentifier,
    productPlanIdentifier: entitlement.productPlanIdentifier ?? null,
    store: entitlement.store,
  } as const;

  if (entitlement.expirationDate === null) {
    return { ...pro, expiresAt: null, status: "lifetime" };
  }

  return {
    ...pro,
    expiresAt: new Date(entitlement.expirationDate),
    status: datedStatusOf(entitlement),
  };
};

/**
 * What happens next to a dated Pro Subscription, and when: it renews, its
 * trial ends, or it ends (cancelled, or a promotional grant running out);
 * `null` for lifetime, which has no date. The Profile card's state line and
 * the Subscription screen's date row both read it.
 */
export const nextEventOf = (
  subscription: ProSubscription
): {
  readonly date: Date;
  readonly kind: "endsOn" | "renewsOn" | "trialEndsOn";
} | null => {
  switch (subscription.status) {
    case "lifetime": {
      return null;
    }

    case "renewing": {
      return { date: subscription.expiresAt, kind: "renewsOn" };
    }

    case "trial": {
      return { date: subscription.expiresAt, kind: "trialEndsOn" };
    }

    case "cancelled":
    case "promotional": {
      return { date: subscription.expiresAt, kind: "endsOn" };
    }
  }
};

/** Where a Subscription is billed, `null` for a store we don't name. */
export type BillingStore = "appStore" | "playStore";

/**
 * The store billing a Pro Subscription: the App Store or Google Play, and
 * `null` for anything else (a promotional grant, which nobody bills, or a
 * store Fitme doesn't sell through).
 */
export const billingStoreOf = (
  subscription: ProSubscription
): BillingStore | null => {
  switch (subscription.store) {
    case "APP_STORE":
    case "MAC_APP_STORE": {
      return "appStore";
    }

    case "PLAY_STORE": {
      return "playStore";
    }

    default: {
      return null;
    }
  }
};

/** A billing period the catalogs name (`subscription.periods`). */
export type BillingPeriod =
  | "monthly"
  | "sixMonths"
  | "threeMonths"
  | "twoMonths"
  | "weekly"
  | "yearly";

const BILLING_PERIODS = {
  P12M: "yearly",
  P1M: "monthly",
  P1W: "weekly",
  P1Y: "yearly",
  P2M: "twoMonths",
  P3M: "threeMonths",
  P6M: "sixMonths",
  P7D: "weekly",
} as const satisfies Record<string, BillingPeriod>;

const isNamedPeriod = (
  period: string
): period is keyof typeof BILLING_PERIODS =>
  Object.hasOwn(BILLING_PERIODS, period);

/**
 * A store product's ISO 8601 `subscriptionPeriod` (`P1M`, `P1Y`) as a period
 * the catalogs name, `null` for none or one they don't.
 */
export const billingPeriodOf = (
  subscriptionPeriod: string | null | undefined
): BillingPeriod | null =>
  subscriptionPeriod && isNamedPeriod(subscriptionPeriod)
    ? BILLING_PERIODS[subscriptionPeriod]
    : null;
