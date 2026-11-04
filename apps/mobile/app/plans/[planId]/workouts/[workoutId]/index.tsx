import { rateLimitedFor } from "@fitme/api-client";
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
import {
  type FullPlan,
  type PlanWorkout,
  usePlanQuery,
} from "~/hooks/queries/plans";
import {
  useOpenWorkoutSessionQuery,
  useOwnOpenWorkoutSession,
} from "~/hooks/queries/workout-sessions";
import {
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
 * Session screen, so Back goes wherever the User came from. Until the open
 * Workout Session has been read (`isOpenSessionKnown`), Start shows loading:
 * it never claims nothing is open before the read has said so.
 */
function WorkoutAction({
  isOpenSessionKnown,
  onLayout,
  planId,
  workoutId,
}: {
  isOpenSessionKnown: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  planId: string;
  workoutId: string;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const openSession = useCallback(
    (sessionId: string) => {
      router.replace(workoutSessionPath(planId, workoutId, sessionId));
    },
    [router, planId, workoutId]
  );
  const { blockedBy, startWorkout, isStarting } = useStartWorkout(
    workoutId,
    openSession
  );
  const ownOpenSession = useOwnOpenWorkoutSession(workoutId);
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
        isLoading={isStarting || !isOpenSessionKnown}
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

/**
 * The Workout's name and planned stats, then a planned card per Exercise.
 * The planned Workout duration and the weights' unit are the Plan's.
 */
function WorkoutContent({
  plan,
  workout,
}: {
  plan: FullPlan;
  workout: PlanWorkout;
}) {
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
  // The Plan's Workout duration, left out while it's unset (ADR 0017).
  const duration = plan.workout_duration;

  return (
    <>
      <Card className="gap-sm" variant="ghost">
        <H4 className="text-primary">{workout.name}</H4>
        <StatRow
          stats={[
            ...(duration === null
              ? []
              : [
                  {
                    label: t("plannedWorkout.stats.duration"),
                    value: t("plannedWorkout.durationMinutes", {
                      minutes: duration,
                    }),
                  },
                ]),
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
            weightUnit={plan.weight_unit}
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
 * the Workout's targets instead of logged sets. It reads its Plan in full
 * (`GET /v1/plans/{id}`, the route's `planId`) and picks the Workout out of
 * it: there is no per-Workout route.
 */
export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { planId, workoutId } = useLocalSearchParams<{
    planId: string;
    workoutId: string;
  }>();
  // `null` once the Plan is gone (deleted, missing or never the User's); a
  // failed refresh keeps the Plan read last.
  const {
    data: plan,
    error: planError,
    isError,
    refetch,
  } = usePlanQuery({ variables: { id: planId } });
  // `null` once the Workout is gone too: replaced by a Plan edit, so the
  // Plan no longer lists it.
  const workout = plan
    ? (plan.workouts.find(({ id }) => id === workoutId) ?? null)
    : plan;
  // Read alongside the Workout, so Start shows blocked from the first frame.
  // Once answered, a failed refresh keeps that answer; with no answer at all
  // the screen can't say whether Start is blocked, so it's the load error.
  const {
    data: openSession,
    error: openSessionError,
    isError: isOpenSessionError,
    refetch: refetchOpenSession,
  } = useOpenWorkoutSessionQuery();
  const isOpenSessionKnown = openSession !== undefined;
  const openSessionFailed = isOpenSessionError && !isOpenSessionKnown;
  // The pinned action's height, safe area included: the content ends above it.
  const [actionHeight, setActionHeight] = useState(0);
  const measureAction = useCallback((event: LayoutChangeEvent) => {
    setActionHeight(event.nativeEvent.layout.height);
  }, []);

  const retry = useCallback(() => {
    refetch();
    refetchOpenSession();
  }, [refetch, refetchOpenSession]);
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  }, [router]);

  // The Workout the pinned action is for: none while it, or whether Start is
  // blocked, can't be shown.
  const shownWorkout = plan && workout && !openSessionFailed ? workout : null;

  const renderContent = () => {
    if (plan && shownWorkout) {
      return <WorkoutContent plan={plan} workout={shownWorkout} />;
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
    if (isError || openSessionFailed) {
      const waitSeconds =
        rateLimitedFor(isError ? planError : null) ??
        (openSessionFailed ? rateLimitedFor(openSessionError) : null);
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            {waitSeconds === null
              ? t("plannedWorkout.loadError")
              : t("common.rateLimited", { seconds: waitSeconds })}
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
          paddingBottom: shownWorkout
            ? actionHeight + BOTTOM_GAP
            : insets.bottom + BOTTOM_GAP,
        }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
      {shownWorkout ? (
        <WorkoutAction
          isOpenSessionKnown={isOpenSessionKnown}
          onLayout={measureAction}
          planId={planId}
          workoutId={shownWorkout.id}
        />
      ) : null}
    </>
  );
}
