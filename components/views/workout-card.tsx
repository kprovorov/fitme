import React, { useEffect, useState } from "react";
import { PlanWorkout } from "~/lib/models";
import { Card } from "@/components/ui/card";
import { H4, P } from "@/components/ui/typography";
import { HStack } from "@/components/ui/hstack";
import { VStack } from "@/components/ui/vstack";
import { Text } from "@/components/ui/text";
import { Zap } from "@/lib/icons/Zap";
import { Clock } from "@/lib/icons/Clock";
import { Flame } from "@/lib/icons/Flame";
import {
  useFinishWorkoutMutation,
  useStartWorkoutMutation,
} from "~/hooks/mutations/workouts";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { ArrowRight } from "~/lib/icons/ArrowRight";
import { Link } from "expo-router";

interface WorkoutCardProps {
  workout: PlanWorkout;
  state?: "upcoming" | "finished" | "default";
}

export default function WorkoutCard({
  workout,
  state = "default",
}: WorkoutCardProps) {
  const queryClient = useQueryClient();

  const { mutate: startWorkout } = useStartWorkoutMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout"] });
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
  });
  const { mutate: finishWorkout } = useFinishWorkoutMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout"] });
      queryClient.invalidateQueries({ queryKey: ["workout-plans"] });
    },
  });

  const [elapsedTime, setElapsedTime] = useState<string>("");

  useEffect(() => {
    if (!workout?.started_at) return;

    const startTime = new Date(workout.started_at).getTime();

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = now - startTime;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setElapsedTime(
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [workout?.started_at]);

  return (
    <Link
      href={`/workouts/${workout.id}`}
      className="rounded-2xl bg-card/50 active:bg-primary-foreground"
    >
      <VStack className="items-stretch flex-shrink p-4 gap-4 w-full">
        <H4 className={`font-nunito-sans-bold text-primary`}>{workout.name}</H4>
        <HStack className="justify-start">
          <HStack className="gap-1">
            <Zap size={16} color="#808080" />
            <Text className="font-nunito-sans-bold text-sm">
              {workout.exercises.length} Exercises
            </Text>
          </HStack>
        </HStack>
        <P className="text-left text-sm text-muted-foreground">
          {workout.description}
        </P>
        {state === "upcoming" && !workout.started_at && (
          <Button onPress={() => startWorkout(workout.id)}>
            <HStack className="gap-2">
              <Text>Start Workout</Text>
              <ArrowRight size={16} className="text-black" />
            </HStack>
          </Button>
        )}
        {!!workout.started_at && !workout.finished_at && (
          <VStack className="items-stretch">
            <Text className="text-3xl text-center">{elapsedTime}</Text>
            <Button onPress={() => finishWorkout(workout.id)}>
              <Text>Finish Workout</Text>
            </Button>
          </VStack>
        )}
      </VStack>
    </Link>
  );
}
