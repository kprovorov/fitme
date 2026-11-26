import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "~/components/symbol-image";
import { Badge } from "~/components/ui/badge";
import { Text } from "~/components/ui/text";
import { useIsProQuery } from "~/hooks/revenueCat";

/**
 * One way of getting a Plan: its name, what it does, and the Pro badge for a
 * way that needs a subscription.
 */
const ChoiceTile = ({
  badge,
  hint,
  icon,
  label,
  onPress,
}: {
  badge?: string;
  hint: string;
  icon: SFSymbol;
  label: string;
  onPress: () => void;
}) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="button"
    className="border-continuous bg-card rounded-card flex-row items-center gap-3 p-4 active:opacity-80"
    onPress={onPress}
  >
    {/* One width for every icon, so each tile's text starts at the same x
        whichever symbol it has (FIT-637). */}
    <View className="w-8 shrink-0 items-center">
      <SymbolImage className="text-primary text-title-2" name={icon} />
    </View>
    <View className="flex-1 flex-col items-start justify-center gap-1">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text variant="large">{label}</Text>
        {badge ? (
          <Badge variant="secondary">
            <Text>{badge}</Text>
          </Badge>
        ) : null}
      </View>
      <Text variant="muted">{hint}</Text>
    </View>
    <SymbolImage
      className="text-body text-muted-foreground shrink-0"
      name="chevron.right"
    />
  </Pressable>
);

/**
 * Create Plan's two choices, the same on every screen that offers them:
 * Build it yourself, free for every User, and Ask Arnold, which carries the
 * Pro badge and shows the paywall unless the User has Pro, and opens the
 * planner (`onOpenPlanner`) when they do.
 *
 * Each caller says how it gets to the planner and to the naming step, since
 * Create Plan replaces itself where another screen would push.
 */
export const CreatePlanChoices = ({
  onBuildByHand,
  onOpenPlanner,
}: {
  onBuildByHand: () => void;
  onOpenPlanner: () => void;
}) => {
  const { t } = useTranslation();

  // A read still in flight counts as not Pro, so Ask Arnold never sends a
  // free User to the planner it would refuse them.
  const { data: isPro } = useIsProQuery();

  const askArnold = useCallback(() => {
    if (isPro) {
      onOpenPlanner();

      return;
    }

    void RevenueCatUI.presentPaywall();
  }, [isPro, onOpenPlanner]);

  return (
    <>
      <ChoiceTile
        hint={t("planBuilder.byHandHint")}
        icon="hammer"
        label={t("planBuilder.byHand")}
        onPress={onBuildByHand}
      />
      <ChoiceTile
        badge={isPro ? undefined : t("planBuilder.pro")}
        hint={t("planBuilder.askArnoldHint")}
        icon="sparkles"
        label={t("planBuilder.askArnold")}
        onPress={askArnold}
      />
    </>
  );
};
