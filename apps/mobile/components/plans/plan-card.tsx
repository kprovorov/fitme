import type { Plan } from "@fitme/core";
import { getGoalLabel, getPlaceLabel } from "@fitme/core";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { Dumbbell } from "~/lib/icons/Dumbbell";
import { Flame } from "~/lib/icons/Flame";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import { House } from "~/lib/icons/House";
import { Zap } from "~/lib/icons/Zap";
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
              {
                icon:
                  plan.goal === "muscle-gain" ? (
                    <BicepsFlexed className="text-muted-foreground" size={16} />
                  ) : plan.goal === "fat-loss" ? (
                    <Flame className="text-muted-foreground" size={16} />
                  ) : (
                    <HeartPulse className="text-muted-foreground" size={16} />
                  ),
                label: getGoalLabel(plan.goal),
              },
              {
                icon: <Zap className="text-muted-foreground" size={16} />,
                label: `${plan.frequency}x per week`,
              },
              {
                icon:
                  plan.place === "gym" ? (
                    <Dumbbell className="text-muted-foreground" size={16} />
                  ) : (
                    <House className="text-muted-foreground" size={16} />
                  ),
                label: getPlaceLabel(plan.place),
              },
            ].map((item) => (
              <HStack className="gap-1" key={item.label}>
                {item.icon}
                <Text className="font-nunito-sans-bold text-subhead">
                  {item.label}
                </Text>
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
