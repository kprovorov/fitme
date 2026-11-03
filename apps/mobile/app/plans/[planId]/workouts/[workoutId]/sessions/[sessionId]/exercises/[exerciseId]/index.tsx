import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "~/components/ui/card";
import ExerciseHistoryView, {
  type ExerciseHistoryHandle,
} from "~/components/views/exercise-history-view";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import RestTimer, { type Rest } from "~/components/workout-sessions/rest-timer";
import SessionExerciseHeader from "~/components/workout-sessions/session-exercise-header";
import SessionLoadError from "~/components/workout-sessions/session-load-error";
import { WorkoutSessionFinishSuggestion } from "~/components/workout-sessions/workout-session-finish-suggestion";
import { useExercise, useExerciseDetailQuery } from "~/hooks/queries/library";
import type { SavedWorkoutSessionExerciseSet } from "~/hooks/queries/workout-session-exercise-sets";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";

/** Gap between the end of the content and the floating rest timer. */
const REST_TIMER_GAP = 16;

/**
 * How close to the end of the screen, in screens, the next page of the
 * Exercise's history is read at.
 */
const HISTORY_NEAR_END_THRESHOLD = 0.5;

/** How often scrolling reports its position, in milliseconds. */
const SCROLL_EVENT_THROTTLE_MS = 16;

export default function WorkoutSessionExerciseScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    planId: _planId,
    workoutId: _workoutId,
    sessionId,
    exerciseId,
  } = useLocalSearchParams();

  // The Exercise comes from its Workout Session's read: a failed refresh
  // keeps it on screen, and with none read yet it's the load error. One the
  // session no longer has (removed elsewhere) is the load error too.
  const {
    data: workoutSession,
    error,
    isError,
    refetch,
  } = useWorkoutSessionQuery({
    variables: { sessionId: sessionId as string },
  });
  const workoutSessionExercise = workoutSession?.exercises.find(
    ({ id }) => id === exerciseId
  );

  const isFinished = !!workoutSession?.finished_at;
  const [rest, setRest] = useState<Rest | null>(null);
  const [restTimerHeight, setRestTimerHeight] = useState(0);
  const exercise = useExercise(workoutSessionExercise?.exercise_slug);
  // The description is only in the Exercise in full; the rest shows from the
  // summary meanwhile.
  const { data: exerciseDetail } = useExerciseDetailQuery(
    workoutSessionExercise?.exercise_slug ?? ""
  );
  // The guide reads the Exercise from the Library: none for one it
  // doesn't know (or that hasn't resolved yet).
  const hasGuide = !!workoutSessionExercise && exercise.isResolved;

  const openGuide = useCallback(() => {
    if (workoutSessionExercise) {
      router.push(`/exercises/${workoutSessionExercise.exercise_slug}/guide`);
    }
  }, [router, workoutSessionExercise]);

  const handleSetLogged = useCallback(
    (set: SavedWorkoutSessionExerciseSet, nextSetOrder: number | null) => {
      if (isFinished || !set.rest_recommended || nextSetOrder === null) {
        setRest(null);
        return;
      }
      setRest({
        duration: set.rest_recommended,
        endsAt: Date.now() + set.rest_recommended * 1000,
        nextSetOrder,
      });
    },
    [isFinished]
  );

  const adjustRest = useCallback((seconds: number) => {
    setRest((current) =>
      current
        ? {
            ...current,
            duration: Math.max(1, current.duration + seconds),
            endsAt: current.endsAt + seconds * 1000,
          }
        : null
    );
  }, []);

  const endRest = useCallback(() => setRest(null), []);

  const handleRestTimerLayout = useCallback((event: LayoutChangeEvent) => {
    setRestTimerHeight(event.nativeEvent.layout.height);
  }, []);

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  // The history is a card inside this screen's scroll view, so the screen is
  // what notices its end coming: each page is read as the User scrolls there.
  const history = useRef<ExerciseHistoryHandle | null>(null);
  const onScroll = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
      const fromEnd =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      if (fromEnd <= HISTORY_NEAR_END_THRESHOLD * layoutMeasurement.height) {
        history.current?.loadMore();
      }
    },
    []
  );

  const renderContent = () => {
    if (workoutSession && workoutSessionExercise) {
      return (
        <>
          <SessionExerciseHeader
            description={exerciseDetail?.description}
            exercise={exercise}
            onOpenGuide={hasGuide ? openGuide : undefined}
          />
          <Card>
            <WorkoutSessionExerciseSetsTableView
              exerciseId={exerciseId as string}
              onSetLogged={handleSetLogged}
              readOnly={isFinished}
              sessionId={sessionId as string}
              weightUnit={workoutSession.weight_unit}
              workoutSessionExerciseSets={workoutSessionExercise.sets}
            />
          </Card>
          <ExerciseHistoryView
            excludeId={exerciseId as string}
            exerciseSlug={workoutSessionExercise.exercise_slug}
            ref={history}
          />
        </>
      );
    }
    if (isError || workoutSession) {
      return (
        <SessionLoadError
          error={error}
          message={t("workoutSessionExercise.loadError")}
          onRetry={retry}
        />
      );
    }
    return (
      <View className="items-center pt-lg">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: workoutSessionExercise ? exercise.name : "",
        }}
      />
      <KeyboardAwareScrollView
        bottomOffset={62}
        contentContainerClassName="gap-sm px-sm pt-xs"
        contentContainerStyle={{
          paddingBottom:
            insets.bottom + 16 + (rest ? restTimerHeight + REST_TIMER_GAP : 0),
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
        showsVerticalScrollIndicator={false}
        testID="workout-session-exercise-scroll"
      >
        {renderContent()}
      </KeyboardAwareScrollView>
      {rest ? (
        <RestTimer
          bottomInset={insets.bottom}
          onAdjust={adjustRest}
          onEnd={endRest}
          onLayout={handleRestTimerLayout}
          rest={rest}
        />
      ) : null}
      <WorkoutSessionFinishSuggestion
        isFinished={isFinished}
        screensAboveSession={1}
        sessionId={sessionId as string}
      />
    </>
  );
}
