import { createQuery } from "react-query-kit";
import Purchases, { CustomerInfo } from "react-native-purchases";

export const useCustomerInfoQuery = createQuery<CustomerInfo>({
  queryKey: ["rc-customer-info"],
  fetcher: async (): Promise<CustomerInfo> => {
    return Purchases.getCustomerInfo();
  },
});

export const useIsProQuery = createQuery<boolean>({
  queryKey: ["rc-is-pro"],
  fetcher: async (): Promise<boolean> => {
    const customerInfo = await Purchases.getCustomerInfo();

    return (
      typeof customerInfo?.entitlements.active["Fitme Pro"] !== "undefined"
    );
  },
});
