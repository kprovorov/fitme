import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { H4 } from "@/components/ui/typography";
import { VStack } from "@/components/ui/vstack";
import { shownExercise, useExercises } from "~/hooks/queries/library";
import type { PlanWorkout } from "~/hooks/queries/plans";
import { useOwnOpenWorkoutSession } from "~/hooks/queries/workout-sessions";

import ExerciseImage from "../exercises/exercise-image";
import OpenSessionBar from "../plans/open-session-bar";
import { COUNT_SYMBOL } from "../plans/plan-symbols";
import { SymbolImage } from "../symbol-image";
import { Card } from "../ui/card";

interface WorkoutCardProps {
  /** The Plan it's in. */
  planId: string;
  workout: PlanWorkout;
}

/**
 * A Workout, compact: its name, Exercise count and thumbnails. Pressing it
 * opens its open Workout Session if it has one (with a timer counting from
 * that session's `started_at`), otherwise its Workout screen. On the Plan
 * screen; the Workout tab has its own cards
 * (`components/workouts/workout-carousel-card.tsx`).
 */
const WorkoutCard = ({ planId, workout }: WorkoutCardProps) => {
  const router = useRouter();
  const { t } = useTranslation();
  const activeSession = useOwnOpenWorkoutSession(workout.id);

  const shownBySlug = useExercises(
    workout.exercises.map(({ exercise_slug }) => exercise_slug)
  );

  const exerciseCount = t("workoutCard.exercises", {
    count: workout.exercises.length,
  });

  const openWorkout = () => {
    router.push(
      activeSession
        ? `/plans/${planId}/workouts/${workout.id}/sessions/${activeSession.id}`
        : `/plans/${planId}/workouts/${workout.id}`
    );
  };

  return (
    <Card className="flex-1">
      <VStack className="flex-1 items-stretch">
        {activeSession && (
          <OpenSessionBar
            href={`/plans/${planId}/workouts/${workout.id}/sessions/${activeSession.id}`}
            startedAt={activeSession.started_at}
          />
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
          <VStack className="w-full flex-shrink items-stretch">
            <View className="gap-sm flex flex-row items-center justify-center">
              <H4 className="text-primary flex-1">{workout.name}</H4>
              <SymbolImage
                className="text-footnote-emphasized text-muted-foreground"
                name="chevron.right"
              />
            </View>
            <HStack className="justify-start">
              <View className="flex flex-row items-center justify-center gap-1">
                <SymbolImage
                  className="text-muted-foreground text-subhead-emphasized"
                  name={COUNT_SYMBOL}
                />
                <Text variant="small">{exerciseCount}</Text>
              </View>
            </HStack>
            {workout.exercises.length > 0 && (
              <ScrollView
                contentContainerClassName="gap-2"
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {workout.exercises
                  .toSorted((a, b) => a.order - b.order)
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
};

export default WorkoutCard;
