import { proEntitlement } from "@fitme/core";
import Purchases from "react-native-purchases";
import type { CustomerInfo } from "react-native-purchases";
import { createMutation, createQuery } from "react-query-kit";

import { subscriptionOf } from "~/lib/subscription";
import type { Subscription } from "~/lib/subscription";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

export const useCustomerInfoQuery = createQuery<CustomerInfo | null>({
  fetcher: async (): Promise<CustomerInfo | null> => {
    if (IS_E2E) {
      return null;
    }

    return await Purchases.getCustomerInfo();
  },
  queryKey: ["rc-customer-info"],
});

export const useIsProQuery = createQuery<boolean>({
  fetcher: async (): Promise<boolean> => {
    if (IS_E2E) {
      return false;
    }

    const customerInfo = await Purchases.getCustomerInfo();

    return customerInfo.entitlements.active[proEntitlement] !== undefined;
  },
  queryKey: ["rc-is-pro"],
});

/**
 * The User's Subscription (`~/lib/subscription`), read from RevenueCat's
 * client `customerInfo`. Under the customer info key, so a refresh of it (pull
 * to refresh, a purchase's update) reads this too. Not retried: a failure is
 * the card's own error with Try Again.
 */
export const useSubscriptionQuery = createQuery<Subscription>({
  fetcher: async (): Promise<Subscription> =>
    subscriptionOf(IS_E2E ? null : await Purchases.getCustomerInfo()),
  queryKey: ["rc-customer-info", "subscription"],
  retry: false,
});

/**
 * The billing period (ISO 8601, `P1M`, `P1Y`) of the store product a
 * Subscription was bought as, `null` when the store doesn't sell it (a
 * promotional grant) or has none. Its Subscription screen's plan line reads
 * it; a failure leaves the line without a period, so it isn't retried.
 */
export const useProductPeriodQuery = createQuery<
  string | null,
  { productIdentifier: string }
>({
  fetcher: async ({ productIdentifier }): Promise<string | null> => {
    const products = await Purchases.getProducts([productIdentifier]);

    return products[0]?.subscriptionPeriod ?? null;
  },
  queryKey: ["rc-product-period"],
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
});

/**
 * Restore Purchases: asks the store for the User's purchases, answering
 * whether that left them with Fitme Pro. RevenueCat tells the customer info
 * listener (`auth-sync.tsx`), which reads the Subscription again.
 */
export const useRestorePurchasesMutation = createMutation<boolean>({
  mutationFn: async (): Promise<boolean> => {
    const customerInfo = await Purchases.restorePurchases();

    return subscriptionOf(customerInfo).kind === "pro";
  },
});
