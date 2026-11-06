import type { ExperienceLevel, Goal, Place } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import type { PlanSummary } from "~/hooks/queries/plans";
import { useChoiceLabels } from "~/lib/choices";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { P } from "../ui/typography";
import {
  COUNT_SYMBOL,
  goalSymbol,
  LEVEL_SYMBOL,
  placeSymbol,
} from "./plan-symbols";

interface PlanCardProps {
  plan: PlanSummary;
}

/**
 * A Plan on the Plans list: its name, its frequency, and whichever of its
 * goal, level and place is set (ADR 0017).
 */
const PlanCard = ({ plan }: PlanCardProps) => {
  const labels = useChoiceLabels();
  const { t } = useTranslation();
  // The API answers these as the columns' text: an id this build doesn't
  // know shows as itself (`useChoiceLabels`) with the default symbol. An
  // unset one (ADR 0017) isn't shown at all.
  // SAFETY: goalSymbol defaults for unknown strings and labels.goal returns unknown ids unchanged.
  const goal = plan.goal as Goal | null;
  // SAFETY: labels.experienceLevel returns unknown string ids unchanged; the icon is constant.
  const level = plan.experience_level as ExperienceLevel | null;
  // SAFETY: placeSymbol defaults for unknown strings and labels.place returns unknown ids unchanged.
  const place = plan.place as Place | null;

  const details = [
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
      icon: COUNT_SYMBOL,
      key: "frequency",
      label: t("plans.frequency", { count: plan.frequency }),
    },
    ...(place
      ? [{ icon: placeSymbol(place), key: "place", label: labels.place(place) }]
      : []),
  ];

  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle
          className={plan.is_active ? "text-primary" : "text-muted-foreground"}
        >
          {plan.name}
        </CardTitle>
        <CardDescription>
          <HStack className="flex-wrap justify-start">
            {details.map((item) => (
              <View
                className="flex flex-row items-center justify-center gap-1"
                key={item.key}
              >
                <SymbolImage
                  className="text-muted-foreground text-subhead-emphasized"
                  name={item.icon}
                />
                <Text variant="small">{item.label}</Text>
              </View>
            ))}
          </HStack>
        </CardDescription>
      </CardHeader>
      {plan.description?.trim() ? (
        <CardContent className="mt-sm">
          <P className="text-muted-foreground">{plan.description}</P>
        </CardContent>
      ) : null}
    </Card>
  );
};

export default PlanCard;
