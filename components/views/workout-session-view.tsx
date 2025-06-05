import React from "react";
import { WorkoutSession } from "~/lib/models";
import { VStack } from "../ui/vstack";
import { H3, P } from "../ui/typography";
import { Link } from "expo-router";
import WorkoutSessionExerciseCard from "./workout-session-exercise-card";
import { Card } from "../ui/card";
import { cn } from "~/lib/utils";
import { Pressable } from "react-native";

interface WorkoutSessionViewProps {
  workoutSession: WorkoutSession;
  planId: number;
  workoutId: number;
  sessionId: number;
}

export default function WorkoutSessionView({
  workoutSession,
  planId,
  workoutId,
  sessionId,
}: WorkoutSessionViewProps) {
  return (
    <VStack className="items-stretch justify-stretch">
      {/* <H3 className="text-primary">{workoutSession.workout.name}</H3> */}
      {/* <P>{workoutSession.workout.description}</P> */}
      <Card className="overflow-hidden">
        <VStack className="gap-0">
          {workoutSession.exercises.map((exercise, i) => (
            <Link
              key={exercise.id}
              href={`/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}/exercises/${exercise.id}`}
              className={cn("py-sm", i !== 0 && "border-t border-border")}
              asChild
            >
              <Pressable className="flex-1 active:opacity-80">
                <WorkoutSessionExerciseCard workoutSessionExercise={exercise} />
              </Pressable>
            </Link>
          ))}
        </VStack>
      </Card>
    </VStack>
  );
}
