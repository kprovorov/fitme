import React from "react";
import { Text } from "../ui/text";
import { PlanData } from "~/lib/models";
import { VStack } from "../ui/vstack";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { getGoalLabel, getPlaceLabel } from "~/lib/labels";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { Flame } from "~/lib/icons/Flame";
import { Zap } from "~/lib/icons/Zap";
import { HStack } from "../ui/hstack";
import { House } from "~/lib/icons/House";
import { Dumbbell } from "~/lib/icons/Dumbbell";
import { Muted } from "../ui/typography";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import WorkoutDataCard from "./workout-data-card";

interface PlanDataViewProps {
  planData: PlanData;
}

export default function PlanDataView({ planData }: PlanDataViewProps) {
  return (
    <VStack className="flex-1 items-stretch">
      <Card className="flex-1 flex-col items-stretch justify-start gap-sm py-sm bg-transparent">
        <CardHeader>
          <CardTitle>{planData.name}</CardTitle>
          <CardDescription>
            <HStack className="justify-start flex-wrap">
              {[
                {
                  icon:
                    planData.goal === "muscle-gain" ? (
                      <BicepsFlexed
                        size={16}
                        className="text-muted-foreground"
                      />
                    ) : planData.goal === "fat-loss" ? (
                      <Flame size={16} className="text-muted-foreground" />
                    ) : (
                      <HeartPulse size={16} className="text-muted-foreground" />
                    ),
                  label: getGoalLabel(planData.goal),
                },
                {
                  icon: <Zap size={16} className="text-muted-foreground" />,
                  label: `${planData.frequency}x per week`,
                },
                {
                  icon:
                    planData.place === "gym" ? (
                      <Dumbbell size={16} className="text-muted-foreground" />
                    ) : (
                      <House size={16} className="text-muted-foreground" />
                    ),
                  label: getPlaceLabel(planData.place),
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
          <Muted>{planData.description}</Muted>
        </CardContent>
      </Card>
      <VStack className="flex-1 items-stretch gap-sm">
        {planData.workouts.map((workout) => (
          <WorkoutDataCard key={workout.order} workoutData={workout} />
        ))}
      </VStack>
    </VStack>
  );
}
