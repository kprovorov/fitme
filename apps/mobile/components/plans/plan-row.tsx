import { Pressable, View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import type { PlanSummary } from "~/hooks/queries/plans";

import { PlanMeta, usePlanMetaItems } from "./plan-meta";

/**
 * One Plan in My Plans' list card (Figma's Plan Row): its name, its details
 * and a chevron, under a separator unless it's the first row. The row is one
 * button opening the Plan, read by VoiceOver as its name and details.
 */
export const PlanRow = ({
  isFirst,
  onPress,
  plan,
}: {
  isFirst: boolean;
  onPress: () => void;
  plan: PlanSummary;
}) => {
  const meta = usePlanMetaItems(plan);

  const spoken = [plan.name, ...meta.map((item) => item.label)]
    .filter(Boolean)
    .join(", ");

  return (
    <Pressable
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
        <SymbolImage
          className="text-body text-muted-foreground shrink-0"
          name="chevron.right"
        />
      </View>
    </Pressable>
  );
};
