import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { planMenuAccessibility } from "~/hooks/plan-actions";
import type { PlanMenuAction } from "~/hooks/plan-actions";
import type { PlanSummary } from "~/hooks/queries/plans";

import { PlanActionsMenu } from "./plan-actions-menu";
import { PlanMeta, usePlanMetaItems } from "./plan-meta";

/**
 * One Plan in My Plans' list card (Figma's Plan Row): its name, its details
 * and a chevron, under a separator unless it's the first row. The row is one
 * button opening the Plan, read by VoiceOver as its name and details; a
 * long press (or VoiceOver's actions) offers `actions`. While the Plan is
 * being activated a spinner takes the chevron's place.
 */
export const PlanRow = ({
  actions,
  isActivating = false,
  isFirst,
  onPress,
  plan,
}: {
  actions: PlanMenuAction[];
  isActivating?: boolean;
  isFirst: boolean;
  onPress: () => void;
  plan: PlanSummary;
}) => {
  const { t } = useTranslation();
  const meta = usePlanMetaItems(plan);

  // The row is one element, so VoiceOver hears the spinner through its label.
  const spoken = [
    plan.name,
    ...meta.map((item) => item.label),
    isActivating ? t("plans.activating") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <PlanActionsMenu actions={actions} testID={`plan-menu-${plan.id}`}>
      <Pressable
        {...planMenuAccessibility(actions)}
        accessibilityLabel={spoken}
        accessibilityRole="button"
        className="px-4 active:opacity-80"
        onPress={onPress}
        testID={`plan-row-${plan.id}`}
      >
        {isFirst ? null : <Separator />}
        <View className="flex-row items-center gap-2 py-3">
          <View className="flex-1 gap-1">
            <Text className="text-headline-emphasized text-foreground">
              {plan.name}
            </Text>
            <PlanMeta className="gap-x-3 gap-y-1" items={meta} />
          </View>
          {isActivating ? (
            <ActivityIndicator
              colorClassName="accent-muted-foreground"
              size="small"
              testID={`plan-activating-${plan.id}`}
            />
          ) : (
            <SymbolImage
              className="text-body text-muted-foreground shrink-0"
              name="chevron.right"
            />
          )}
        </View>
      </Pressable>
    </PlanActionsMenu>
  );
};
