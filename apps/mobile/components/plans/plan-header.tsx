import type { Plan } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useChoiceLabels } from "~/lib/choices";
import { Badge } from "../ui/badge";
import { Text } from "../ui/text";
import { COUNT_SYMBOL, goalSymbol, placeSymbol } from "./plan-symbols";

interface PlanHeaderProps {
  plan: Plan;
}

/**
 * The active Plan at the top of the Workout tab, as plain content (Figma
 * `PlanOverview`): its name, its frequency, goal and place as lime badges,
 * and its description. Not tappable.
 */
export default function PlanHeader({ plan }: PlanHeaderProps) {
  const labels = useChoiceLabels();
  const { t } = useTranslation();
  return (
    <View className="items-start gap-xs py-sm">
      <Text accessibilityRole="header" className="text-title-1-emphasized">
        {plan.name}
      </Text>
      <View className="flex-row flex-wrap gap-sm">
        <Badge icon={COUNT_SYMBOL}>
          <Text>{t("plans.frequency", { count: plan.frequency })}</Text>
        </Badge>
        <Badge icon={goalSymbol(plan.goal)}>
          <Text>{labels.goal(plan.goal)}</Text>
        </Badge>
        <Badge icon={placeSymbol(plan.place)}>
          <Text>{labels.place(plan.place)}</Text>
        </Badge>
      </View>
      <Text className="text-muted-foreground text-subhead">
        {plan.description}
      </Text>
    </View>
  );
}
