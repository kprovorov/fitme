import type { ExperienceLevel, Goal, Place } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "~/components/symbol-image";
import { Text } from "~/components/ui/text";
import type { PlanSummary } from "~/hooks/queries/plans";
import { useChoiceLabels } from "~/lib/choices";
import { cn } from "~/lib/utils";

import {
  FREQUENCY_SYMBOL,
  goalSymbol,
  LEVEL_SYMBOL,
  placeSymbol,
} from "./plan-symbols";

interface PlanMetaItem {
  icon: SFSymbol;
  key: string;
  label: string;
}

type PlanDetails = Pick<
  PlanSummary,
  "experience_level" | "frequency" | "goal" | "place"
>;

/**
 * A Plan's goal, experience level, frequency and place, in that order, each
 * with its symbol; a detail the Plan hasn't got is left out (ADR 0017).
 */
export const usePlanMetaItems = (plan: PlanDetails): PlanMetaItem[] => {
  const labels = useChoiceLabels();
  const { t } = useTranslation();
  // The API answers these as the columns' text: an id this build doesn't
  // know shows as itself (`useChoiceLabels`) with the default symbol.
  // SAFETY: goalSymbol defaults for unknown strings and labels.goal returns unknown ids unchanged.
  const goal = plan.goal as Goal | null;
  // SAFETY: labels.experienceLevel returns unknown string ids unchanged; the icon is constant.
  const level = plan.experience_level as ExperienceLevel | null;
  // SAFETY: placeSymbol defaults for unknown strings and labels.place returns unknown ids unchanged.
  const place = plan.place as Place | null;

  return [
    ...(goal
      ? [{ icon: goalSymbol(goal), key: "goal", label: labels.goal(goal) }]
      : []),
    ...(level
      ? [
          {
            icon: LEVEL_SYMBOL,
            key: "level",
            label: labels.experienceLevel(level),
          },
        ]
      : []),
    {
      icon: FREQUENCY_SYMBOL,
      key: "frequency",
      label: t("plans.frequency", { count: plan.frequency }),
    },
    ...(place
      ? [{ icon: placeSymbol(place), key: "place", label: labels.place(place) }]
      : []),
  ];
};

/**
 * A Plan's details as a wrapping row of quiet symbol and label pairs
 * (Figma's Plan Meta), Footnote in `muted-foreground`. `className` sets the
 * gaps, which differ between the hero card and a row.
 */
export const PlanMeta = ({
  className,
  items,
}: {
  className?: string;
  items: PlanMetaItem[];
}) => (
  <View className={cn("flex-row flex-wrap items-center", className)}>
    {items.map((item) => (
      <View className="flex-row items-center gap-1" key={item.key}>
        <SymbolImage
          className="text-footnote text-muted-foreground"
          name={item.icon}
        />
        <Text className="text-footnote text-muted-foreground">
          {item.label}
        </Text>
      </View>
    ))}
  </View>
);
