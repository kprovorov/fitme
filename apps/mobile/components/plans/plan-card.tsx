import type { ExperienceLevel, Goal, Place } from "@fitme/core";
import { useTranslation } from "react-i18next";
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
export default function PlanCard({ plan }: PlanCardProps) {
  const labels = useChoiceLabels();
  const { t } = useTranslation();
  // The API answers these as the columns' text: an id this build doesn't
  // know shows as itself (`useChoiceLabels`) with the default symbol. An
  // unset one (ADR 0017) isn't shown at all.
  const goal = plan.goal as Goal | null;
  const level = plan.experience_level as ExperienceLevel | null;
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
    <Card className="flex-1 gap-sm">
      <CardHeader>
        <CardTitle
          className={plan.is_active ? "text-primary" : "text-muted-foreground"}
        >
          {plan.name}
        </CardTitle>
        <CardDescription>
          <HStack className="flex-wrap justify-start">
            {details.map((item) => (
              <HStack className="gap-1" key={item.key}>
                <SymbolImage
                  className="text-muted-foreground text-subhead-emphasized"
                  name={item.icon}
                />
                <Text className="text-subhead-emphasized">{item.label}</Text>
              </HStack>
            ))}
          </HStack>
        </CardDescription>
      </CardHeader>
      {plan.description?.trim() ? (
        <CardContent>
          <P className="text-muted-foreground">{plan.description}</P>
        </CardContent>
      ) : null}
    </Card>
  );
}
