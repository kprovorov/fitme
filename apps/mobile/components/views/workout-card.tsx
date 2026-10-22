import type { Workout } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { H4 } from "@/components/ui/typography";
import { VStack } from "@/components/ui/vstack";
import { useFinishWorkoutSession } from "~/hooks/finish-workout-session";
import {
  type ShownExercise,
  shownExercise,
  useExercises,
} from "~/hooks/queries/exercise-library";
import { useCreateWorkoutSessionMutation } from "~/hooks/queries/workout-sessions";
import { cn } from "~/lib/utils";
import ExerciseImage from "../exercises/exercise-image";
import { COUNT_SYMBOL } from "../plans/plan-symbols";
import { SymbolImage } from "../symbol-image";
import { Button } from "../ui/button";
import { Card } from "../ui/card";

/**
 * Finishes the Workout's active session the way the session screen does
 * (see `useFinishWorkoutSession`), then opens its Summary over Home.
 */
function FinishWorkoutButton({ sessionId }: { sessionId: string }) {
  const { confirmFinish, isFinishing } = useFinishWorkoutSession(sessionId, {
    outsideSession: true,
  });
  return (
    <Button
      isLoading={isFinishing}
      label="Finish Workout"
      onPress={confirmFinish}
      variant="secondary"
    />
  );
}

interface WorkoutExerciseRowProps {
  exercise: ShownExercise | undefined;
  isOpen: boolean;
  setCount: number;
  slug: string;
}

/**
 * One of the Workout's Exercises: its thumbnail, and its sets and name once
 * the card is open. Opens the Exercise's detail screen once it's resolved.
 */
function WorkoutExerciseRow({
  exercise: resolved,
  isOpen,
  setCount,
  slug,
}: WorkoutExerciseRowProps) {
  const exercise = resolved ?? shownExercise(slug, null);
  const row = (
    <Pressable
      accessibilityLabel={exercise.name}
      className="flex flex-row items-center justify-between active:opacity-70"
      disabled={!exercise.isResolved}
    >
      <HStack className="gap-2">
        <ExerciseImage exercise={exercise} />
        {isOpen ? (
          <Text className="text-footnote-emphasized">
            <Text className="text-footnote-emphasized text-primary">
              {setCount} x{" "}
            </Text>
            {exercise.name}
          </Text>
        ) : null}
      </HStack>
      {isOpen && exercise.isResolved ? (
        <SymbolImage
          className="text-footnote-emphasized text-foreground"
          name="chevron.right"
        />
      ) : null}
    </Pressable>
  );
  return exercise.isResolved ? (
    <Link asChild href={`/exercises/${slug}`}>
      {row}
    </Link>
  ) : (
    row
  );
}

interface WorkoutCardProps {
  state?: "upcoming" | "finished" | "default";
  workout: Workout;
}

export default function WorkoutCard({
  workout,
  state = "default",
}: WorkoutCardProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const {
    mutateAsync: createWorkoutSession,
    isPending: isCreatingWorkoutSession,
  } = useCreateWorkoutSessionMutation({
    onSuccess: (workoutSession) => {
      queryClient.invalidateQueries({ queryKey: ["workout"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      router.push(
        `/plans/${workout.plan_id}/workouts/${workout.id}/sessions/${workoutSession.id}`
      );
    },
  });

  const startWorkout = () => {
    createWorkoutSession({ workoutId: workout.id });
  };

  const activeSession = workout.sessions.find(
    (session) => session.started_at && !session.finished_at
  );

  const [elapsedTime, setElapsedTime] = useState<string>("");

  useEffect(() => {
    if (!activeSession?.started_at) {
      return;
    }

    const startTime = new Date(activeSession.started_at).getTime();

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
  }, [activeSession?.started_at]);

  const exercises = useExercises(
    workout.exercises.map(({ exercise_slug }) => exercise_slug)
  );

  const [isOpen, setIsOpen] = useState(false);
  const toggleOpen = useCallback(() => setIsOpen(!isOpen), [isOpen]);

  return (
    <Card className="flex-1">
      <VStack className="flex-1 items-stretch gap-4">
        {activeSession && (
          <Link
            asChild
            href={`/plans/${workout.plan_id}/workouts/${workout.id}/sessions/${activeSession.id}`}
          >
            <Pressable className="flex-row items-center justify-between rounded-xl border-continuous bg-primary px-3 py-2 active:opacity-80">
              <HStack className="flex-1 justify-start gap-1">
                <SymbolImage
                  className="text-primary-foreground text-subhead-emphasized"
                  name="timer"
                />
                <Text className="text-primary-foreground text-subhead-emphasized">
                  {elapsedTime}
                </Text>
              </HStack>

              <HStack className="gap-1">
                <Text className="text-primary-foreground text-subhead-emphasized">
                  To Workout
                </Text>
                <SymbolImage
                  className="text-primary-foreground text-subhead-emphasized"
                  name="arrow.right"
                />
              </HStack>
            </Pressable>
          </Link>
        )}
        <Pressable onPress={toggleOpen}>
          <VStack className="w-full flex-shrink items-stretch gap-4">
            <H4 className="text-primary">{workout.name}</H4>
            <HStack className="justify-start">
              <HStack className="gap-1">
                <SymbolImage
                  className="text-muted-foreground text-subhead-emphasized"
                  name={COUNT_SYMBOL}
                />
                <Text className="text-subhead-emphasized">
                  {workout.exercises.length} Exercises
                </Text>
              </HStack>
            </HStack>
            <ScrollView
              contentContainerClassName="gap-2"
              contentInsetAdjustmentBehavior="automatic"
              horizontal={!isOpen}
              scrollEnabled={!isOpen}
              showsHorizontalScrollIndicator={false}
            >
              <View
                className={cn(
                  "flex items-stretch gap-2",
                  isOpen ? "flex-col" : "flex-row"
                )}
              >
                {workout.exercises.map((workoutExercise) => (
                  <WorkoutExerciseRow
                    exercise={exercises[workoutExercise.exercise_slug]}
                    isOpen={isOpen}
                    key={workoutExercise.id}
                    setCount={workoutExercise.sets.length}
                    slug={workoutExercise.exercise_slug}
                  />
                ))}
              </View>
            </ScrollView>
          </VStack>
        </Pressable>
        {state === "upcoming" && (
          <VStack className="items-stretch">
            {activeSession ? (
              <FinishWorkoutButton sessionId={activeSession.id} />
            ) : (
              <Button
                icon="arrow.right"
                iconPosition="trailing"
                isLoading={isCreatingWorkoutSession}
                label="Start Workout"
                onPress={startWorkout}
                testID="start-workout-button"
              />
            )}
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
