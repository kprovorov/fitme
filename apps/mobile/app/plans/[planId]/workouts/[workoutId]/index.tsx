import type { Workout } from "@fitme/core";
import { formatNumber } from "@fitme/i18n";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { BlockedStart } from "~/components/workout-sessions/blocked-start";
import { StatRow } from "~/components/workout-sessions/workout-session-stats";
import { useExercises } from "~/hooks/queries/library";
import { useOpenWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { useWorkoutQuery } from "~/hooks/queries/workouts";
import {
  findOpenSession,
  openSessionPath,
  useStartWorkout,
  workoutSessionPath,
} from "~/hooks/start-workout";
import { useI18n } from "~/lib/i18n";
import { cn } from "~/lib/utils";

/** Space between the content's end (or the pinned action) and the bottom. */
const BOTTOM_GAP = 16;

/**
 * The screen's one action, pinned above the safe area with the content
 * scrolling under it: Continue Workout when the Workout already has an open
 * Workout Session, the blocked Start while another Workout's is open,
 * otherwise Start Workout. Each replaces this screen with the Workout
 * Session screen, so Back goes wherever the User came from.
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
  const { t } = useTranslation();
  const openSession = useCallback(
    (sessionId: string) => {
      router.replace(
        workoutSessionPath(workout.plan_id, workout.id, sessionId)
      );
    },
    [router, workout.plan_id, workout.id]
  );
  const { blockedBy, startWorkout, isStarting } = useStartWorkout(
    workout.id,
    openSession
  );
  const ownOpenSession = findOpenSession(workout);
  const continueWorkout = useCallback(() => {
    if (ownOpenSession) {
      openSession(ownOpenSession.id);
    }
  }, [openSession, ownOpenSession]);
  const continueBlocking = useCallback(() => {
    if (blockedBy) {
      router.replace(openSessionPath(blockedBy));
    }
  }, [router, blockedBy]);

  const renderAction = () => {
    if (ownOpenSession) {
      return (
        <Button
          icon="arrow.right"
          iconPosition="trailing"
          label={t("startWorkout.continue")}
          onPress={continueWorkout}
          size="lg"
        />
      );
    }
    if (blockedBy) {
      return (
        <BlockedStart
          blockedBy={blockedBy}
          onContinue={continueBlocking}
          size="lg"
        />
      );
    }
    return (
      <Button
        icon="arrow.right"
        iconPosition="trailing"
        isLoading={isStarting}
        label={t("startWorkout.start")}
        onPress={startWorkout}
        size="lg"
        testID="start-workout-button"
      />
    );
  };

  return (
    <View
      // Blocked, it's a bottom bar: its caption and the disabled Start would
      // be unreadable over the content scrolling under them.
      className={cn(
        "absolute inset-x-0 bottom-0 px-sm",
        blockedBy &&
          !ownOpenSession &&
          "border-border border-hairline border-t bg-background pt-sm"
      )}
      onLayout={onLayout}
      pointerEvents="box-none"
      style={{ paddingBottom: insets.bottom + BOTTOM_GAP }}
    >
      {renderAction()}
    </View>
  );
}

/** The Workout's name and planned stats, then a planned card per Exercise. */
function WorkoutContent({ workout }: { workout: Workout }) {
  const { t } = useTranslation();
  const i18n = useI18n();
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
              label: t("plannedWorkout.stats.duration"),
              value: t("plannedWorkout.durationMinutes", {
                minutes: workout.plan.workout_duration,
              }),
            },
            {
              label: t("plannedWorkout.stats.exercises"),
              value: formatNumber(i18n, exercises.length),
            },
            {
              label: t("plannedWorkout.stats.sets"),
              value: formatNumber(i18n, setCount),
            },
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
          {t("plannedWorkout.noExercises")}
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
  const { t } = useTranslation();
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const {
    data: workout,
    isError,
    refetch,
  } = useWorkoutQuery({ variables: { id: workoutId } });
  // Read alongside the Workout, so Start shows blocked from the first frame.
  useOpenWorkoutSessionQuery();
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
            {t("plannedWorkout.gone")}
          </Text>
          <Button
            fill={false}
            label={t("plannedWorkout.goBack")}
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
            {t("plannedWorkout.loadError")}
          </Text>
          <Button
            fill={false}
            label={t("common.tryAgain")}
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
