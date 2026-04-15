import React from "react";
import { WorkoutData } from "~/lib/models";
import { H4, P } from "@/components/ui/typography";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { Zap } from "@/lib/icons/Zap";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { Card } from "../ui/card";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";

interface WorkoutDataCardProps {
  workoutData: WorkoutData;
  compact?: boolean;
}

export default function WorkoutDataCard({
  workoutData,
  compact = false,
}: WorkoutDataCardProps) {
  const content = (
    <VStack
      className={cn(
        "w-full items-stretch",
        compact ? "gap-0 px-3 py-3" : "gap-4 p-4",
      )}
    >
      <VStack className={cn("items-stretch", compact ? "gap-2" : "gap-3")}>
        <HStack className="items-center justify-between">
          <H4 className="font-nunito-sans-bold text-primary flex-1">
            {workoutData.name}
          </H4>
          <Badge
            variant="secondary"
            className="flex-row gap-1 rounded-full px-2 py-0.5"
          >
            <Zap size={11} className="text-secondary-foreground" />
            <Text className="text-xs font-nunito-sans-semibold text-secondary-foreground">
              {workoutData.exercises.length}
            </Text>
          </Badge>
        </HStack>
        {!compact && (
          <P className="text-left text-sm text-muted-foreground">
            {workoutData.description}
          </P>
        )}
      </VStack>
      <View
        className={cn("border-t border-white/10", compact ? "mt-2" : "mt-1")}
      />
      <VStack
        className={cn("items-stretch", compact ? "gap-1.5 mt-2" : "gap-2")}
      >
        {workoutData.exercises.map((exercise) => (
          <Link
            href={`/exercises/${exercise.exercise.id}`}
            key={exercise.exercise.id}
            asChild
          >
            <Pressable className="active:opacity-70 flex-row items-center justify-between py-0.5">
              <HStack className="flex-1 gap-2.5 items-center">
                <Text className="font-ibm-plex-mono text-xs text-primary w-6 text-right">
                  {exercise.sets.length}×
                </Text>
                <Text
                  className={cn(
                    "flex-1 font-nunito-sans-semibold",
                    compact ? "text-sm" : "text-xs",
                  )}
                >
                  {exercise.exercise.name}
                </Text>
              </HStack>
              <ChevronRight size={14} className="text-muted-foreground" />
            </Pressable>
          </Link>
        ))}
      </VStack>
    </VStack>
  );

  if (compact) {
    return content;
  }

  return <Card className="overflow-hidden">{content}</Card>;
}
