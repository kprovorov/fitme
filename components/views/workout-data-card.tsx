import React from "react";
import { WorkoutData } from "~/lib/models";
import { H4, P } from "@/components/ui/typography";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { Zap } from "@/lib/icons/Zap";
import { Link } from "expo-router";
import { Pressable } from "react-native";
import { Card } from "../ui/card";
import { ChevronRight } from "~/lib/icons/ChevronRight";
import ExerciseImage from "../exercises/exercise-image";

interface WorkoutDataCardProps {
  workoutData: WorkoutData;
}

export default function WorkoutDataCard({ workoutData }: WorkoutDataCardProps) {
  return (
    <Card className="overflow-hidden">
      <VStack className="items-stretch gap-0">
        <VStack className="items-stretch gap-4 w-full p-4">
          <H4 className="font-nunito-sans-bold text-primary">
            {workoutData.name}
          </H4>
          <HStack className="justify-start">
            <HStack className="gap-1">
              <Zap size={16} color="#808080" />
              <Text className="font-nunito-sans-bold text-sm">
                {workoutData.exercises.length} Exercises
              </Text>
            </HStack>
          </HStack>
          <P className="text-left text-sm text-muted-foreground">
            {workoutData.description}
          </P>
          <VStack className="gap-2 items-stretch">
            {workoutData.exercises.map((exercise) => (
              <Link
                href={`/exercises/${exercise.exercise.id}`}
                key={exercise.exercise.id}
                asChild
              >
                <Pressable className="active:opacity-70 flex flex-row justify-between items-center">
                  <HStack className="gap-2">
                    <ExerciseImage exercise={exercise.exercise} />
                    <Text className="font-bold text-xs">
                      <Text className="font-bold text-xs text-primary">
                        {exercise.sets.length} x{" "}
                      </Text>
                      {exercise.exercise.name}
                    </Text>
                  </HStack>
                  <ChevronRight size={16} className="text-foreground" />
                </Pressable>
              </Link>
            ))}
          </VStack>
        </VStack>
      </VStack>
    </Card>
  );
}
