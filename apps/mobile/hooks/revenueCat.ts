import { proEntitlement } from "@fitme/core";
import Purchases from "react-native-purchases";
import type { CustomerInfo } from "react-native-purchases";
import { createQuery } from "react-query-kit";

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
