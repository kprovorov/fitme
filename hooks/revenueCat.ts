import Purchases, { type CustomerInfo } from "react-native-purchases";
import { createQuery } from "react-query-kit";

const IS_E2E = process.env.EXPO_PUBLIC_E2E_ENABLED === "true";

export const useCustomerInfoQuery = createQuery<CustomerInfo | null>({
  queryKey: ["rc-customer-info"],
  fetcher: async (): Promise<CustomerInfo | null> => {
    if (IS_E2E) {
      return null;
    }
    return await Purchases.getCustomerInfo();
  },
});

export const useIsProQuery = createQuery<boolean>({
  queryKey: ["rc-is-pro"],
  fetcher: async (): Promise<boolean> => {
    if (IS_E2E) {
      return false;
    }
    const customerInfo = await Purchases.getCustomerInfo();

    return (
      typeof customerInfo?.entitlements.active["Fitme Pro"] !== "undefined"
    );
  },
});
