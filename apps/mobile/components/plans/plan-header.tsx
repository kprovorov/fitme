import type { Plan } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useChoiceLabels } from "~/lib/choices";
import { Badge } from "../ui/badge";
import { Text } from "../ui/text";
import { H2 } from "../ui/typography";
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
      {/* Title 1 Emphasized in white, as Figma has it, not H2's lime. */}
      <H2 className="text-foreground">{plan.name}</H2>
      <View className="flex-row flex-wrap gap-x-sm gap-y-xs">
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
      {plan.description.trim() ? (
        <Text className="text-muted-foreground text-subhead">
          {plan.description}
        </Text>
      ) : null}
    </View>
  );
}
