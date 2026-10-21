import type { PlanData } from "@fitme/core";
import { getGoalLabel, getPlaceLabel } from "@fitme/core";
import { Fragment } from "react";
import { View } from "react-native";
import { SymbolImage } from "~/components/symbol-image";
import { cn } from "~/lib/utils";
import { COUNT_SYMBOL, goalSymbol, placeSymbol } from "../plans/plan-symbols";
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
      <Card className={compact ? "gap-3" : "gap-sm"}>
        <CardHeader className={compact ? "gap-3" : undefined}>
          <CardTitle>{planData.name}</CardTitle>
          <HStack className="flex-wrap justify-start gap-2">
            {[
              {
                icon: (
                  <SymbolImage
                    className="text-footnote-emphasized text-secondary-foreground"
                    name={goalSymbol(planData.goal)}
                  />
                ),
                label: getGoalLabel(planData.goal),
              },
              {
                icon: (
                  <SymbolImage
                    className="text-footnote-emphasized text-secondary-foreground"
                    name={COUNT_SYMBOL}
                  />
                ),
                label: `${planData.frequency}x / week`,
              },
              {
                icon: (
                  <SymbolImage
                    className="text-footnote-emphasized text-secondary-foreground"
                    name={placeSymbol(planData.place)}
                  />
                ),
                label: getPlaceLabel(planData.place),
              },
            ].map((item) => (
              <Badge key={item.label} variant="secondary">
                {item.icon}
                <Text>{item.label}</Text>
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
