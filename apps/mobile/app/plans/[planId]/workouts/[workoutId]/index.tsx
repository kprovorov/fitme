import { rateLimitedFor } from "@fitme/api-client";
import { formatNumber } from "@fitme/i18n";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScopedVariables } from "uniwind";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import PlannedWorkoutExerciseCard from "~/components/views/planned-workout-exercise-card";
import { BlockedStart } from "~/components/workout-sessions/blocked-start";
import { StatRow } from "~/components/workout-sessions/workout-session-stats";
import { useExercises } from "~/hooks/queries/library";
import { usePlanQuery } from "~/hooks/queries/plans";
import type { FullPlan, PlanWorkout } from "~/hooks/queries/plans";
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
const WorkoutAction = ({
  isOpenSessionKnown,
  onLayout,
  planId,
  workoutId,
}: {
  isOpenSessionKnown: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  planId: string;
  workoutId: string;
}) => {
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
    <ScopedVariables
      variables={{ "--workout-action-bottom": insets.bottom + BOTTOM_GAP }}
    >
      <View
        // Blocked, it's a bottom bar: its caption and the disabled Start would
        // be unreadable over the content scrolling under them.
        className={cn(
          "px-sm absolute inset-x-0 bottom-0 pb-(--workout-action-bottom)",
          blockedBy &&
            !ownOpenSession &&
            "border-border border-hairline bg-background pt-sm border-t"
        )}
        onLayout={onLayout}
        pointerEvents="box-none"
      >
        {renderAction()}
      </View>
    </ScopedVariables>
  );
};

/**
 * The Workout's name and planned stats, then a planned card per Exercise.
 * The planned Workout duration and the weights' unit are the Plan's.
 */
const WorkoutContent = ({
  plan,
  workout,
}: {
  plan: FullPlan;
  workout: PlanWorkout;
}) => {
  const { t } = useTranslation();
  const i18n = useI18n();
  const exercises = workout.exercises.toSorted((a, b) => a.order - b.order);

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
      <Card variant="ghost">
        <View className="gap-sm">
          <H4>{workout.name}</H4>
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
        </View>
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
        <View className="px-sm">
          <Text className="text-center" variant="muted">
            {t("plannedWorkout.noExercises")}
          </Text>
        </View>
      )}
    </>
  );
};

/**
 * A Workout of a Plan, read-only: the Workout Session screen's layout with
 * the Workout's targets instead of logged sets. It reads its Plan in full
 * (`GET /v1/plans/{id}`, the route's `planId`) and picks the Workout out of
 * it: there is no per-Workout route.
 */
const WorkoutScreen = () => {
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

  // The Plan editor, opened with this Workout's editor already pushed.
  const editWorkout = useCallback(() => {
    router.push({
      params: { planId, workoutId },
      pathname: "/plans/[planId]/edit",
    });
  }, [planId, router, workoutId]);

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
        <View className="gap-sm pt-lg items-center">
          <Text className="text-center" variant="muted">
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
        <View className="gap-sm pt-lg items-center">
          <Text className="text-center" variant="muted">
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
      <View className="pt-lg items-center" testID="workout-loading">
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
          unstable_headerRightItems: shownWorkout
            ? () => [
                {
                  icon: { name: "square.and.pencil", type: "sfSymbol" },
                  label: t("plannedWorkout.edit"),
                  onPress: editWorkout,
                  type: "button",
                },
              ]
            : undefined,
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
};

export default WorkoutScreen;
