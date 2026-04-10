import React, { Fragment } from "react";
import { View } from "react-native";
import { Text } from "../ui/text";
import { PlanData } from "~/lib/models";
import { VStack } from "../ui/vstack";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
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
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";

interface PlanDataViewProps {
  planData: PlanData;
  compact?: boolean;
}

export default function PlanDataView({
  planData,
  compact = false,
}: PlanDataViewProps) {
  return (
    <VStack className="items-stretch">
      <Card
        className={cn(
          "flex-col items-stretch justify-start bg-transparent",
          compact ? "gap-3 py-3" : "gap-sm py-sm",
        )}
      >
        <CardHeader className={compact ? "gap-3 px-3" : undefined}>
          <CardTitle>{planData.name}</CardTitle>
          <HStack className="justify-start flex-wrap gap-2">
            {[
              {
                icon:
                  planData.goal === "muscle-gain" ? (
                    <BicepsFlexed
                      size={13}
                      className="text-secondary-foreground"
                    />
                  ) : planData.goal === "fat-loss" ? (
                    <Flame size={13} className="text-secondary-foreground" />
                  ) : (
                    <HeartPulse
                      size={13}
                      className="text-secondary-foreground"
                    />
                  ),
                label: getGoalLabel(planData.goal),
              },
              {
                icon: <Zap size={13} className="text-secondary-foreground" />,
                label: `${planData.frequency}x / week`,
              },
              {
                icon:
                  planData.place === "gym" ? (
                    <Dumbbell size={13} className="text-secondary-foreground" />
                  ) : (
                    <House size={13} className="text-secondary-foreground" />
                  ),
                label: getPlaceLabel(planData.place),
              },
            ].map((item, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex-row gap-1.5 rounded-full px-2.5 py-1"
              >
                {item.icon}
                <Text className="text-xs font-nunito-sans-semibold text-secondary-foreground">
                  {item.label}
                </Text>
              </Badge>
            ))}
          </HStack>
        </CardHeader>
        {!compact && (
          <CardContent>
            <Muted>{planData.description}</Muted>
          </CardContent>
        )}
      </Card>
      <VStack className={cn("items-stretch", !compact && "gap-sm")}>
        {planData.workouts.map((workout, index) => (
          <Fragment key={workout.order}>
            {compact && index > 0 && (
              <View className="border-t border-white/10" />
            )}
            <WorkoutDataCard workoutData={workout} compact={compact} />
          </Fragment>
        ))}
      </VStack>
    </VStack>
  );
}
