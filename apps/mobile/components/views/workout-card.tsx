import type { Workout } from "@fitme/core";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { H4 } from "@/components/ui/typography";
import { VStack } from "@/components/ui/vstack";
import { useFinishWorkoutSession } from "~/hooks/finish-workout-session";
import { shownExercise, useExercises } from "~/hooks/queries/library";
import { useStartWorkout, workoutSessionPath } from "~/hooks/start-workout";
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

interface WorkoutCardProps {
  state?: "upcoming" | "finished" | "default";
  workout: Workout;
}

/**
 * A Workout, compact: its name, Exercise count and thumbnails. Pressing it
 * opens its open Workout Session if it has one, otherwise its Workout
 * screen. The Next Workout (`upcoming`) also gets Start or Finish.
 */
export default function WorkoutCard({
  workout,
  state = "default",
}: WorkoutCardProps) {
  const router = useRouter();
  const { startWorkout, isStarting } = useStartWorkout(
    workout.id,
    (sessionId) => {
      router.push(workoutSessionPath(workout.plan_id, workout.id, sessionId));
    }
  );

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

  const shownBySlug = useExercises(
    workout.exercises.map(({ exercise_slug }) => exercise_slug)
  );

  const exerciseCount = `${workout.exercises.length} ${
    workout.exercises.length === 1 ? "Exercise" : "Exercises"
  }`;
  const openWorkout = () => {
    router.push(
      activeSession
        ? `/plans/${workout.plan_id}/workouts/${workout.id}/sessions/${activeSession.id}`
        : `/plans/${workout.plan_id}/workouts/${workout.id}`
    );
  };

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
        <Pressable
          accessibilityHint={
            activeSession
              ? "Opens the workout in progress"
              : "Opens the workout"
          }
          accessibilityLabel={`${workout.name}, ${exerciseCount}`}
          accessibilityRole="button"
          className="active:opacity-70"
          onPress={openWorkout}
        >
          <VStack className="w-full flex-shrink items-stretch gap-4">
            <HStack className="gap-sm">
              <H4 className="flex-1 text-primary">{workout.name}</H4>
              <SymbolImage
                className="text-footnote-emphasized text-muted-foreground"
                name="chevron.right"
              />
            </HStack>
            <HStack className="justify-start">
              <HStack className="gap-1">
                <SymbolImage
                  className="text-muted-foreground text-subhead-emphasized"
                  name={COUNT_SYMBOL}
                />
                <Text className="text-subhead-emphasized">{exerciseCount}</Text>
              </HStack>
            </HStack>
            {workout.exercises.length > 0 && (
              <ScrollView
                contentContainerClassName="gap-2"
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {[...workout.exercises]
                  .sort((a, b) => a.order - b.order)
                  .map(({ exercise_slug, id }) => (
                    <ExerciseImage
                      exercise={
                        shownBySlug[exercise_slug] ??
                        shownExercise(exercise_slug, null)
                      }
                      key={id}
                    />
                  ))}
              </ScrollView>
            )}
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
                isLoading={isStarting}
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
