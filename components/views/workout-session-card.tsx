import React from "react";
import { WorkoutSession } from "~/lib/models";
import { H4, P } from "@/components/ui/typography";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { Zap } from "@/lib/icons/Zap";
import { Card } from "../ui/card";

interface WorkoutSessionCardProps {
  workoutSession: WorkoutSession;
}

export default function WorkoutSessionCard({
  workoutSession,
}: WorkoutSessionCardProps) {
  return (
    <Card>
      <VStack className="items-stretch flex-shrink p-4 gap-4 w-full">
        <H4 className={`font-nunito-sans-bold text-primary`}>
          {workoutSession.workout.name}
        </H4>
        <HStack className="justify-start">
          <HStack className="gap-1">
            <Zap size={16} color="#808080" />
            <Text className="font-nunito-sans-bold text-sm">
              {workoutSession.exercises.length} Exercises
            </Text>
          </HStack>
        </HStack>
        <P className="text-left text-sm text-muted-foreground">
          {workoutSession.workout.description}
        </P>
      </VStack>
    </Card>
  );
}
