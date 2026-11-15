import { formatDate } from "@fitme/i18n";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions, View } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSubscriptionQuery } from "~/hooks/revenueCat";
import { openUrl } from "~/lib/external-links";
import { useI18n } from "~/lib/i18n";
import { nextEventOf } from "~/lib/subscription";
import type { ProSubscription } from "~/lib/subscription";

/**
 * The card's surface (the Figma component still named `PlanCard`): `card`
 * fill, border, `sm` padding.
 */
const CARD_CLASS =
  "gap-sm rounded-card border-border bg-card p-sm w-full border";

/**
 * The text scale from which a row's button goes under its text: at the
 * accessibility Dynamic Type sizes a date beside it would break mid-word.
 */
const STACKED_FONT_SCALE = 1.5;

/** A text-and-button row, stacked at the accessibility text sizes. */
const useRowClass = () => {
  const { fontScale } = useWindowDimensions();

  return fontScale >= STACKED_FONT_SCALE
    ? `${CARD_CLASS} items-start`
    : `${CARD_CLASS} flex-row items-center`;
};

const presentPaywall = () => {
  void RevenueCatUI.presentPaywall();
};

/**
 * While the Subscription loads (Figma frame 1476:3701): grey bars
 * where the Free card's text and button go, never the Free card itself, read
 * by VoiceOver as one element saying it's loading.
 */
export const SubscriptionSkeleton = () => {
  const { t } = useTranslation();

  return (
    <View
      accessibilityLabel={t("subscription.loading")}
      accessibilityRole="progressbar"
      accessible
      className={CARD_CLASS}
      testID="subscription-card-loading"
    >
      <View className="gap-xs w-full">
        <View className="bg-muted h-5.5 w-35 rounded-full" />
        <View className="bg-muted h-4 w-4/5 rounded-full" />
        <View className="bg-muted h-4 w-3/5 rounded-full" />
      </View>
      <View className="bg-muted h-(--size-button-pill-lg) w-full rounded-full" />
    </View>
  );
};

/** A failed read (Figma frame 1476:3767), with Try Again. */
export const SubscriptionError = ({
  isRetrying,
  onRetry,
}: {
  isRetrying: boolean;
  onRetry: () => void;
}) => {
  const { t } = useTranslation();
  const rowClass = useRowClass();

  return (
    <View className={rowClass}>
      <Text className="text-headline-emphasized text-foreground shrink grow">
        {t("subscription.loadError")}
      </Text>
      <Button
        fill={false}
        isLoading={isRetrying}
        label={t("common.tryAgain")}
        onPress={onRetry}
        size="sm"
        variant="secondary"
      />
    </View>
  );
};

/** Free (Figma's Profile – Free, 1476:3301): what Pro adds and the upgrade. */
export const FreeCard = () => {
  const { t } = useTranslation();

  return (
    <View className={CARD_CLASS}>
      <View className="w-full gap-1">
        <Text className="text-headline-emphasized text-foreground">
          {t("subscription.free.title")}
        </Text>
        <Text className="text-subhead text-muted-foreground">
          {t("subscription.free.description")}
        </Text>
      </View>
      <Button
        label={t("subscription.free.upgrade")}
        onPress={presentPaywall}
        size="lg"
      />
    </View>
  );
};

/** What happens next to a Pro Subscription: its date, or Lifetime. */
const useStatusLine = (subscription: ProSubscription): string => {
  const { t } = useTranslation();
  const i18n = useI18n();
  const next = nextEventOf(subscription);

  if (next === null) {
    return t("subscription.lifetime");
  }

  const date = formatDate(i18n, next.date, "dayMonthYear");

  return t(`subscription.${next.kind}`, { date });
};

/**
 * Fitme Pro (Figma's Profile – Pro, 1476:3624): the badge, its state line and
 * Manage, which opens the customer's `managementURL` and is hidden when
 * RevenueCat has none.
 */
const ProCard = ({ subscription }: { subscription: ProSubscription }) => {
  const { t } = useTranslation();
  const statusLine = useStatusLine(subscription);
  const rowClass = useRowClass();
  const { managementURL } = subscription;

  return (
    <View className={rowClass}>
      <View className="gap-xs shrink grow items-start">
        <Badge>
          <Text>{t("subscription.pro")}</Text>
        </Badge>
        <Text className="text-subhead text-muted-foreground">{statusLine}</Text>
      </View>
      {managementURL ? (
        <Button
          fill={false}
          label={t("subscription.manage")}
          onPress={() => {
            void openUrl(managementURL);
          }}
          size="sm"
          variant="secondary"
        />
      ) : null}
    </View>
  );
};

/**
 * The User's Subscription on Profile, from RevenueCat's client
 * `customerInfo`: a skeleton while it loads, Free with the upgrade, or Fitme
 * Pro with its state and Manage. A failed read is its own error with Try
 * Again; the rest of Profile never waits on it. A failed refresh keeps what
 * was read.
 */
const SubscriptionCard = () => {
  const {
    data: subscription,
    isError,
    isFetching,
    refetch,
  } = useSubscriptionQuery();

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  if (subscription?.kind === "pro") {
    return <ProCard subscription={subscription} />;
  }

  if (subscription?.kind === "free") {
    return <FreeCard />;
  }

  return isError ? (
    <SubscriptionError isRetrying={isFetching} onRetry={retry} />
  ) : (
    <SubscriptionSkeleton />
  );
};

export default SubscriptionCard;
