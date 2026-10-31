import type { Workout } from "@fitme/core";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView } from "react-native";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { H4 } from "@/components/ui/typography";
import { VStack } from "@/components/ui/vstack";
import { shownExercise, useExercises } from "~/hooks/queries/library";
import { findOpenSession } from "~/hooks/start-workout";
import ExerciseImage from "../exercises/exercise-image";
import { COUNT_SYMBOL } from "../plans/plan-symbols";
import { SymbolImage } from "../symbol-image";
import { Card } from "../ui/card";

interface WorkoutCardProps {
  workout: Workout;
}

/**
 * A Workout, compact: its name, Exercise count and thumbnails. Pressing it
 * opens its open Workout Session if it has one, otherwise its Workout
 * screen. On the Plan screen; the Workout tab has its own cards
 * (`components/workouts/workout-carousel-card.tsx`).
 */
export default function WorkoutCard({ workout }: WorkoutCardProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const activeSession = findOpenSession(workout);

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

  const exerciseCount = t("workoutCard.exercises", {
    count: workout.exercises.length,
  });
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
                  {t("workoutCard.toWorkout")}
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
              ? t("workoutCard.openInProgressHint")
              : t("workoutCard.openHint")
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
      </VStack>
    </Card>
  );
}
