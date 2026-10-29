import type { Workout } from "@fitme/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import PlannedWorkoutExerciseCard from "~/components/views/planned-workout-exercise-card";
import { StatRow } from "~/components/workout-sessions/workout-session-stats";
import { useExercises } from "~/hooks/queries/library";
import { useWorkoutQuery } from "~/hooks/queries/workouts";
import {
  findOpenSession,
  useStartWorkout,
  workoutSessionPath,
} from "~/hooks/start-workout";

/** Space between the content's end (or the pinned action) and the bottom. */
const BOTTOM_GAP = 16;

/**
 * The screen's one action, pinned above the safe area with the content
 * scrolling under it: Continue Workout when the Workout already has an open
 * Workout Session, otherwise Start Workout. Either replaces this screen with
 * the Workout Session screen, so Back goes wherever the User came from.
 */
function WorkoutAction({
  onLayout,
  workout,
}: {
  onLayout: (event: LayoutChangeEvent) => void;
  workout: Workout;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openSession = useCallback(
    (sessionId: string) => {
      router.replace(
        workoutSessionPath(workout.plan_id, workout.id, sessionId)
      );
    },
    [router, workout.plan_id, workout.id]
  );
  const { startWorkout, isStarting } = useStartWorkout(workout.id, openSession);
  const ownOpenSession = findOpenSession(workout);
  const continueWorkout = useCallback(() => {
    if (ownOpenSession) {
      openSession(ownOpenSession.id);
    }
  }, [openSession, ownOpenSession]);

  return (
    <View
      className="absolute inset-x-0 bottom-0 px-sm"
      onLayout={onLayout}
      pointerEvents="box-none"
      style={{ paddingBottom: insets.bottom + BOTTOM_GAP }}
    >
      {ownOpenSession ? (
        <Button
          icon="arrow.right"
          iconPosition="trailing"
          label="Continue Workout"
          onPress={continueWorkout}
          size="lg"
        />
      ) : (
        <Button
          icon="arrow.right"
          iconPosition="trailing"
          isLoading={isStarting}
          label="Start Workout"
          onPress={startWorkout}
          size="lg"
          testID="start-workout-button"
        />
      )}
    </View>
  );
}

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
  // The pinned action's height, safe area included: the content ends above it.
  const [actionHeight, setActionHeight] = useState(0);
  const measureAction = useCallback((event: LayoutChangeEvent) => {
    setActionHeight(event.nativeEvent.layout.height);
  }, []);

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
        contentContainerStyle={{
          paddingBottom: workout
            ? actionHeight + BOTTOM_GAP
            : insets.bottom + BOTTOM_GAP,
        }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
      {workout ? (
        <WorkoutAction onLayout={measureAction} workout={workout} />
      ) : null}
    </>
  );
}
