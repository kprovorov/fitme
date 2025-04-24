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
import { View } from "react-native";
import { Muted } from "../ui/typography";
import { Dumbbell } from "~/lib/icons/Dumbbell";
import { House } from "~/lib/icons/House";
import { Calendar } from "~/lib/icons/Calendar";
import { VStack } from "../ui/vstack";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { Flame } from "~/lib/icons/Flame";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import { CalendarClock } from "~/lib/icons/CalendarClock";
import { ListChecks } from "~/lib/icons/ListChecks";

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
                  plan.goal === "gain_muscle" ? (
                    <BicepsFlexed size={16} className="text-muted-foreground" />
                  ) : plan.goal === "lose_weight" ? (
                    <Flame size={16} className="text-muted-foreground" />
                  ) : (
                    <HeartPulse size={16} className="text-muted-foreground" />
                  ),
                label:
                  plan.goal === "gain_muscle"
                    ? "Gain Muscle"
                    : plan.goal === "lose_weight"
                    ? "Lose Weight"
                    : "Improve Health",
              },
              {
                icon: <Zap size={16} className="text-muted-foreground" />,
                label: `${plan.workouts.length} workouts`,
              },
              {
                icon:
                  plan.place === "gym" ? (
                    <Dumbbell size={16} className="text-muted-foreground" />
                  ) : (
                    <House size={16} className="text-muted-foreground" />
                  ),
                label: plan.place === "gym" ? "Gym" : "Home",
              },
              {
                icon: (
                  <ListChecks size={16} className="text-muted-foreground" />
                ),
                label: `${plan.frequency}x per week`,
              },
              {
                icon: (
                  <CalendarClock size={16} className="text-muted-foreground" />
                ),
                label: "4 weeks",
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
