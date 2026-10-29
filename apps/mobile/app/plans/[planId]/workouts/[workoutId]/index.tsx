import type { Workout } from "@fitme/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import PlannedWorkoutExerciseCard from "~/components/views/planned-workout-exercise-card";
import { StatRow } from "~/components/workout-sessions/workout-session-stats";
import { useExercises } from "~/hooks/queries/library";
import { useWorkoutQuery } from "~/hooks/queries/workouts";

/** The Workout's name and planned stats, then a planned card per Exercise. */
function WorkoutContent({ workout }: { workout: Workout }) {
  const exercises = [...workout.exercises].sort((a, b) => a.order - b.order);
  const shownBySlug = useExercises(
    exercises.map(({ exercise_slug }) => exercise_slug)
  );
  const setCount = exercises.reduce(
    (total, exercise) => total + exercise.sets.length,
    0
  );

  return (
    <>
      <Card className="gap-sm" variant="ghost">
        <H4 className="text-primary">{workout.name}</H4>
        <StatRow
          stats={[
            {
              label: "Duration",
              value: `${workout.plan.workout_duration} min`,
            },
            { label: "Exercises", value: `${exercises.length}` },
            { label: "Sets", value: `${setCount}` },
          ]}
        />
      </Card>
      {exercises.length > 0 ? (
        exercises.map((workoutExercise) => (
          <PlannedWorkoutExerciseCard
            exercise={shownBySlug[workoutExercise.exercise_slug]}
            key={workoutExercise.id}
            workoutExercise={workoutExercise}
          />
        ))
      ) : (
        <Text className="px-sm text-center text-muted-foreground">
          This workout has no exercises yet.
        </Text>
      )}
    </>
  );
}

/**
 * A Workout of a Plan, read-only: the Workout Session screen's layout with
 * the Workout's targets instead of logged sets.
 */
export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const {
    data: workout,
    isError,
    refetch,
  } = useWorkoutQuery({ variables: { id: workoutId } });

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);

  const renderContent = () => {
    if (workout) {
      return <WorkoutContent workout={workout} />;
    }
    // Replaced by a Plan edit, or its Plan deleted.
    if (workout === null) {
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            This workout no longer exists
          </Text>
          <Button
            fill={false}
            label="Go Back"
            onPress={goBack}
            variant="secondary"
          />
        </View>
      );
    }
    if (isError) {
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            Couldn't load this workout. Check your connection and try again.
          </Text>
          <Button
            fill={false}
            label="Try Again"
            onPress={retry}
            variant="secondary"
          />
        </View>
      );
    }
    return (
      <View className="items-center pt-lg" testID="workout-loading">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  };

  return (
    <>
      {/* The Workout's name heads the content: the header only goes back. */}
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTransparent: true,
          title: "",
        }}
      />
      <ScrollView
        contentContainerClassName="gap-sm px-sm pt-xs"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
    </>
  );
}
