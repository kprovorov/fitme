import type { Plan } from "@fitme/core";
import { getGoalLabel, getPlaceLabel } from "@fitme/core";
import { SymbolImage } from "~/components/symbol-image";
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
import { COUNT_SYMBOL, goalSymbol, placeSymbol } from "./plan-symbols";

interface PlanCardProps {
  plan: Plan;
}

export default function PlanCard({ plan }: PlanCardProps) {
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
              { icon: goalSymbol(plan.goal), label: getGoalLabel(plan.goal) },
              { icon: COUNT_SYMBOL, label: `${plan.frequency}x per week` },
              {
                icon: placeSymbol(plan.place),
                label: getPlaceLabel(plan.place),
              },
            ].map((item) => (
              <HStack className="gap-1" key={item.label}>
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
