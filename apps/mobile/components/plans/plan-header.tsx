import type { Goal, Place } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import type { FullPlan } from "~/hooks/queries/plans";
import { useChoiceLabels } from "~/lib/choices";

import { Badge } from "../ui/badge";
import { Text } from "../ui/text";
import { H2 } from "../ui/typography";
import { COUNT_SYMBOL, goalSymbol, placeSymbol } from "./plan-symbols";

interface PlanHeaderProps {
  plan: Pick<FullPlan, "description" | "frequency" | "goal" | "name" | "place">;
}

/**
 * The active Plan at the top of the Workout tab, as plain content (Figma
 * `PlanOverview`): its name, its frequency and whichever of its goal and
 * place is set (ADR 0017) as lime badges, and its description. Not tappable.
 */
const PlanHeader = ({ plan }: PlanHeaderProps) => {
  const labels = useChoiceLabels();
  const { t } = useTranslation();
  // The API answers these as the columns' text: an id this build doesn't
  // know shows as itself (`useChoiceLabels`) with the default symbol.
  // SAFETY: Only passed to label and symbol lookups, both of which handle unknown goal ids.
  const goal = plan.goal as Goal | null;
  // SAFETY: Only passed to label and symbol lookups, both of which handle unknown place ids.
  const place = plan.place as Place | null;

  return (
    <View className="gap-xs py-sm items-start">
      {/* Title 1 Emphasized in white, as Figma has it, not H2's lime. */}
      <H2 className="text-foreground">{plan.name}</H2>
      <View className="gap-x-sm gap-y-xs flex-row flex-wrap">
        <Badge icon={COUNT_SYMBOL}>
          <Text>{t("plans.frequency", { count: plan.frequency })}</Text>
        </Badge>
        {goal ? (
          <Badge icon={goalSymbol(goal)}>
            <Text>{labels.goal(goal)}</Text>
          </Badge>
        ) : null}
        {place ? (
          <Badge icon={placeSymbol(place)}>
            <Text>{labels.place(place)}</Text>
          </Badge>
        ) : null}
      </View>
      {plan.description?.trim() ? (
        <Text variant="muted">{plan.description}</Text>
      ) : null}
    </View>
  );
};

export default PlanHeader;
