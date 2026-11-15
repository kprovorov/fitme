import { formatDate } from "@fitme/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import {
  FreeCard,
  SubscriptionError,
  SubscriptionSkeleton,
} from "~/components/profile/subscription-card";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import {
  useProductPeriodQuery,
  useRestorePurchasesMutation,
  useSubscriptionQuery,
} from "~/hooks/revenueCat";
import { openUrl } from "~/lib/external-links";
import { useI18n } from "~/lib/i18n";
import {
  billingPeriodOf,
  billingStoreOf,
  nextEventOf,
} from "~/lib/subscription";
import type { ProSubscription } from "~/lib/subscription";
import { showToast } from "~/lib/toast";

/**
 * A detail row (Figma's `ListRow`, type detail): the label, and its value
 * after it, at least 44 pt tall. Every row but the group's first draws the
 * separator above it, inset by the row's leading padding. VoiceOver reads the
 * label with the value.
 */
const DetailRow = ({
  first = false,
  label,
  testID,
  value,
}: {
  first?: boolean;
  label: string;
  testID?: string;
  value: string;
}) => (
  <View
    accessibilityLabel={label}
    accessibilityValue={{ text: value }}
    accessible
    className="pl-sm"
    testID={testID}
  >
    {first ? null : <Separator />}
    <View className="gap-xs pr-sm min-h-11 flex-row items-center py-3">
      <Text className="text-body text-foreground grow">{label}</Text>
      <Text className="text-body text-muted-foreground shrink text-right">
        {value}
      </Text>
    </View>
  </View>
);

/**
 * The plan line's product: "Fitme Pro · <period>" from the store product's
 * billing period, "Fitme Pro · Lifetime" for lifetime, and "Fitme Pro" alone
 * while the period is unknown (still loading, a promotional grant no store
 * sells, or a failed read).
 */
const useProductLine = (subscription: ProSubscription): string => {
  const { t } = useTranslation();
  const isLifetime = subscription.status === "lifetime";

  const { data: period } = useProductPeriodQuery({
    enabled: !isLifetime,
    variables: { productIdentifier: subscription.productIdentifier },
  });

  if (isLifetime) {
    return t("subscription.productLine", {
      period: t("subscription.periods.lifetime"),
    });
  }

  const billingPeriod = billingPeriodOf(period);

  return billingPeriod === null
    ? t("subscription.pro")
    : t("subscription.productLine", {
        period: t(`subscription.periods.${billingPeriod}`),
      });
};

/** Where the Subscription stands, as its Status row says it. */
const STATUS_KEYS = {
  cancelled: "subscription.status.cancelled",
  lifetime: "subscription.status.lifetime",
  promotional: "subscription.status.active",
  renewing: "subscription.status.active",
  trial: "subscription.status.trial",
} as const;

/**
 * Fitme Pro (Figma's Subscription – Pro, 1481:6051): the Subscription, its
 * Status and what happens next and when, the store billing it (none for a
 * promotional grant), and Manage Subscription, which opens the customer's
 * `managementURL` (a cancelled Subscription's included, so the User can
 * resubscribe) and is hidden when RevenueCat has none.
 */
const ProDetails = ({ subscription }: { subscription: ProSubscription }) => {
  const { t } = useTranslation();
  const i18n = useI18n();
  const productLine = useProductLine(subscription);
  const next = nextEventOf(subscription);
  const store = billingStoreOf(subscription);
  const { managementURL } = subscription;

  return (
    <>
      <View className="gap-xs w-full">
        <Text
          accessibilityRole="header"
          className="ml-sm text-footnote-emphasized text-muted-foreground"
        >
          {t("subscription.heading")}
        </Text>
        <View className="rounded-card border-border bg-card w-full overflow-hidden border">
          <DetailRow
            first
            label={t("subscription.rows.subscription")}
            testID="subscription-product"
            value={productLine}
          />
          <DetailRow
            label={t("subscription.rows.status")}
            testID="subscription-status"
            value={t(STATUS_KEYS[subscription.status])}
          />
          {next === null ? null : (
            <DetailRow
              label={t(`subscription.rows.${next.kind}`)}
              testID="subscription-date"
              value={formatDate(i18n, next.date, "dayMonthYear")}
            />
          )}
        </View>
        {store === null ? null : (
          <Text
            className="ml-sm text-footnote text-muted-foreground"
            testID="subscription-billing"
          >
            {t(`subscription.billing.${store}`)}
          </Text>
        )}
      </View>
      {managementURL ? (
        <Button
          label={t("subscription.manageSubscription")}
          onPress={() => {
            void openUrl(managementURL);
          }}
          size="lg"
          variant="secondary"
        />
      ) : null}
    </>
  );
};

/**
 * Restore Purchases, on Free and Pro alike: asks the store again, then says
 * in a toast whether that left the User with Fitme Pro, or that it failed,
 * and reads the Subscription again either way.
 */
const RestorePurchases = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { isPending, mutate } = useRestorePurchasesMutation({
    onError: () => {
      showToast(t("subscription.restoreFailed"));
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rc-customer-info"] }),
        queryClient.invalidateQueries({ queryKey: ["rc-is-pro"] }),
      ]);
    },
    onSuccess: (isPro) => {
      showToast(
        t(isPro ? "subscription.restored" : "subscription.nothingToRestore")
      );
    },
  });

  const restore = useCallback(() => {
    mutate();
  }, [mutate]);

  return (
    <Button
      isLoading={isPending}
      label={t("subscription.restore")}
      onPress={restore}
      size="lg"
      testID="restore-purchases"
      variant="ghost"
    />
  );
};

/**
 * The Subscription screen, from RevenueCat's client `customerInfo` like the
 * Profile card: a skeleton while it loads, Free with the upgrade (Figma's
 * Subscription – Free, 1481:6372) or Fitme Pro's details, and Restore
 * Purchases on both. A failed read is the card's error with Try Again; a
 * failed refresh keeps what was read.
 */
const SubscriptionView = () => {
  const {
    data: subscription,
    isError,
    isFetching,
    refetch,
  } = useSubscriptionQuery();

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (subscription === undefined) {
    return (
      <View className="gap-md w-full pt-2.5 pb-14">
        {isError ? (
          <SubscriptionError isRetrying={isFetching} onRetry={retry} />
        ) : (
          <SubscriptionSkeleton />
        )}
      </View>
    );
  }

  return (
    <View className="gap-md w-full pt-2.5 pb-14">
      {subscription.kind === "pro" ? (
        <ProDetails subscription={subscription} />
      ) : (
        <FreeCard />
      )}
      <RestorePurchases />
    </View>
  );
};

export default SubscriptionView;
