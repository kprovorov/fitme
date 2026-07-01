import { Fragment } from "react";
import { View } from "react-native";
import { BicepsFlexed } from "~/lib/icons/BicepsFlexed";
import { Dumbbell } from "~/lib/icons/Dumbbell";
import { Flame } from "~/lib/icons/Flame";
import { HeartPulse } from "~/lib/icons/HeartPulse";
import { House } from "~/lib/icons/House";
import { Zap } from "~/lib/icons/Zap";
import { getGoalLabel, getPlaceLabel } from "~/lib/labels";
import type { PlanData } from "~/lib/models";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { HStack } from "../ui/hstack";
import { Text } from "../ui/text";
import { Muted } from "../ui/typography";
import { VStack } from "../ui/vstack";
import WorkoutDataCard from "./workout-data-card";

interface PlanDataViewProps {
  compact?: boolean;
  planData: PlanData;
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
          compact ? "gap-3 py-3" : "gap-sm py-sm"
        )}
      >
        <CardHeader className={compact ? "gap-3 px-3" : undefined}>
          <CardTitle>{planData.name}</CardTitle>
          <HStack className="flex-wrap justify-start gap-2">
            {[
              {
                icon:
                  planData.goal === "muscle-gain" ? (
                    <BicepsFlexed
                      className="text-secondary-foreground"
                      size={13}
                    />
                  ) : planData.goal === "fat-loss" ? (
                    <Flame className="text-secondary-foreground" size={13} />
                  ) : (
                    <HeartPulse
                      className="text-secondary-foreground"
                      size={13}
                    />
                  ),
                label: getGoalLabel(planData.goal),
              },
              {
                icon: <Zap className="text-secondary-foreground" size={13} />,
                label: `${planData.frequency}x / week`,
              },
              {
                icon:
                  planData.place === "gym" ? (
                    <Dumbbell className="text-secondary-foreground" size={13} />
                  ) : (
                    <House className="text-secondary-foreground" size={13} />
                  ),
                label: getPlaceLabel(planData.place),
              },
            ].map((item) => (
              <Badge
                className="flex-row gap-1.5 rounded-full px-2.5 py-1"
                key={item.label}
                variant="secondary"
              >
                {item.icon}
                <Text className="font-nunito-sans-semibold text-footnote text-secondary-foreground">
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
              <View className="border-white/10 border-t" />
            )}
            <WorkoutDataCard compact={compact} workoutData={workout} />
          </Fragment>
        ))}
      </VStack>
    </VStack>
  );
}
