import React from "react";
import { Plan } from "@/lib/models";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { HStack } from "../ui/hstack";
import { Zap } from "~/lib/icons/Zap";
import { Text } from "../ui/text";
import { Muted } from "../ui/typography";
import { Dumbbell } from "~/lib/icons/Dumbbell";
import { House } from "~/lib/icons/House";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { Flame } from "~/lib/icons/Flame";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import { getGoalLabel, getPlaceLabel } from "~/lib/labels";

interface PlanCardProps {
  plan: Plan;
}

export default function PlanCard({ plan }: PlanCardProps) {
  return (
    <Card className="flex-1 flex-col items-stretch justify-start gap-sm py-sm">
      <CardHeader>
        <CardTitle
          className={plan.is_active ? "text-primary" : "text-muted-foreground"}
        >
          {plan.name}
        </CardTitle>
        <CardDescription>
          <HStack className="justify-start flex-wrap">
            {[
              {
                icon:
                  plan.goal === "muscle-gain" ? (
                    <BicepsFlexed size={16} className="text-muted-foreground" />
                  ) : plan.goal === "fat-loss" ? (
                    <Flame size={16} className="text-muted-foreground" />
                  ) : (
                    <HeartPulse size={16} className="text-muted-foreground" />
                  ),
                label: getGoalLabel(plan.goal),
              },
              {
                icon: <Zap size={16} className="text-muted-foreground" />,
                label: `${plan.frequency}x per week`,
              },
              {
                icon:
                  plan.place === "gym" ? (
                    <Dumbbell size={16} className="text-muted-foreground" />
                  ) : (
                    <House size={16} className="text-muted-foreground" />
                  ),
                label: getPlaceLabel(plan.place),
              },
            ].map((item, index) => (
              <HStack className="gap-1" key={index}>
                {item.icon}
                <Text className="font-nunito-sans-bold text-sm">
                  {item.label}
                </Text>
              </HStack>
            ))}
          </HStack>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Muted>{plan.description}</Muted>
      </CardContent>
    </Card>
  );
}
