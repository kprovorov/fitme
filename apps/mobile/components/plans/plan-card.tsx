import type { Plan } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { SymbolImage } from "~/components/symbol-image";
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
  plan: Plan;
}

export default function PlanCard({ plan }: PlanCardProps) {
  const labels = useChoiceLabels();
  const { t } = useTranslation();
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
            {[
              {
                icon: goalSymbol(plan.goal),
                key: "goal",
                label: labels.goal(plan.goal),
              },
              {
                icon: LEVEL_SYMBOL,
                key: "level",
                label: labels.experienceLevel(plan.experience_level),
              },
              {
                icon: COUNT_SYMBOL,
                key: "frequency",
                label: t("plans.frequency", { count: plan.frequency }),
              },
              {
                icon: placeSymbol(plan.place),
                key: "place",
                label: labels.place(plan.place),
              },
            ].map((item) => (
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
      <CardContent>
        <P className="text-muted-foreground">{plan.description}</P>
      </CardContent>
    </Card>
  );
}
