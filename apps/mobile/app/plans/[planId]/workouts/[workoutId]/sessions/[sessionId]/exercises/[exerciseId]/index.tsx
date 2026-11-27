import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ExerciseNote } from "~/components/notes/exercise-note";
import type { LeavingAction } from "~/components/notes/exercise-note";
import { Card } from "~/components/ui/card";
import ExerciseHistoryView from "~/components/views/exercise-history-view";
import type {
  ExerciseHistoryHandle,
  ExerciseHistoryTrigger,
} from "~/components/views/exercise-history-view";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import RestTimer from "~/components/workout-sessions/rest-timer";
import type { Rest } from "~/components/workout-sessions/rest-timer";
import SessionExerciseHeader from "~/components/workout-sessions/session-exercise-header";
import SessionLoadError from "~/components/workout-sessions/session-load-error";
import { WorkoutSessionFinishSuggestion } from "~/components/workout-sessions/workout-session-finish-suggestion";
import { useEndedWorkoutSession } from "~/hooks/ended-workout-session";
import { useExercise, useExerciseDetailQuery } from "~/hooks/queries/library";
import type { SavedWorkoutSessionExerciseSet } from "~/hooks/queries/workout-session-exercise-sets";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { nextUnloggedSet, useShownSets } from "~/hooks/shown-sets";
import { CLIP_SCROLL_EDGE_EFFECTS } from "~/lib/constants";
import { isNotesEnabled } from "~/lib/feature-flags";

/** How far above the keyboard a focused set input stays. */
const SET_KEYBOARD_BOTTOM_OFFSET = 62;

/**
 * How far above the keyboard the focused field stays with notes on: room for
 * what sits under the note's field while it's edited (its count, then Cancel
 * and Save), which is more than a set row needs.
 */
const NOTE_KEYBOARD_BOTTOM_OFFSET = 88;

/** Gap between the end of the content and the floating rest timer. */
const REST_TIMER_GAP = 16;

/**
 * How close to the end of the screen, in screens, the next page of the
 * Exercise's history is read at.
 */
const HISTORY_NEAR_END_THRESHOLD = 0.5;

/** How often scrolling reports its position, in milliseconds. */
const SCROLL_EVENT_THROTTLE_MS = 16;

/**
 * Whether leaving goes without asking about an unsaved note: the session's
 * screens moving on by themselves (it ended elsewhere, or a finish or
 * discard elsewhere in the app), which reset the stack. Unsaved text is lost
 * then, as the sets' unsaved input is; the User's own way back still asks.
 */
const isSessionMovingOn = ({ type }: LeavingAction) => type === "RESET";

const WorkoutSessionExerciseScreen = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    planId: _planId,
    workoutId: _workoutId,
    sessionId,
    exerciseId,
  } = useLocalSearchParams<{
    planId: string;
    workoutId: string;
    sessionId: string;
    exerciseId: string;
  }>();

  // The Exercise comes from its Workout Session's read: a failed refresh
  // keeps it on screen, and with none read yet it's the load error. One the
  // session no longer has (removed elsewhere) is the load error too.
  const {
    data: workoutSession,
    error,
    isError,
    refetch,
  } = useWorkoutSessionQuery({
    variables: { sessionId },
  });

  // Finished or deleted elsewhere: the session's screens move on, this one
  // included, as from the session screen.
  useEndedWorkoutSession(sessionId);

  const workoutSessionExercise = workoutSession?.exercises.find(
    ({ id }) => id === exerciseId
  );

  const isFinished = !!workoutSession?.finished_at;

  const shownSets = useShownSets(
    exerciseId,
    workoutSessionExercise?.sets,
    isFinished
  );

  const [rest, setRest] = useState<Rest | null>(null);
  // A finished session has no rest to count down, however it was finished.
  const shownRest = isFinished ? null : rest;
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

  // Under the Exercise's own slug: the one replacing a replaced slug.
  const openGuide = useCallback(() => {
    if (workoutSessionExercise) {
      router.push(`/exercises/${exercise.slug}/guide`);
    }
  }, [exercise.slug, router, workoutSessionExercise]);

  const handleSetLogged = useCallback(
    (set: SavedWorkoutSessionExerciseSet, hasNextSet: boolean) => {
      if (isFinished || !set.rest_recommended || !hasNextSet) {
        setRest(null);

        return;
      }

      setRest({
        duration: set.rest_recommended,
        endsAt: Date.now() + set.rest_recommended * 1000,
        loggedSetId: set.id,
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
    void refetch();
  }, [refetch]);

  // The history is a card inside this screen's scroll view, so the screen is
  // what notices its end coming: each page is read as the User scrolls there.
  // A drag ending there is told apart, since after a failed page only the
  // User's own gesture asks again (see `ExerciseHistoryHandle`).
  const history = useRef<ExerciseHistoryHandle | null>(null);

  const askForHistory = useCallback(
    (
      { nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>,
      trigger: ExerciseHistoryTrigger
    ) => {
      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;

      const fromEnd =
        contentSize.height - contentOffset.y - layoutMeasurement.height;

      if (fromEnd <= HISTORY_NEAR_END_THRESHOLD * layoutMeasurement.height) {
        history.current?.loadMore(trigger);
      }
    },
    []
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      askForHistory(event, "scroll"),
    [askForHistory]
  );

  const onScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      askForHistory(event, "drag-end"),
    [askForHistory]
  );

  const renderContent = () => {
    if (workoutSession && workoutSessionExercise) {
      return (
        <>
          <SessionExerciseHeader
            description={exerciseDetail?.short_description}
            exercise={exercise}
            onOpenGuide={hasGuide ? openGuide : undefined}
          />
          {isNotesEnabled() ? (
            // Keyed by the stored slug, so Replace starts the new Exercise's
            // own, while the Library resolving it doesn't drop a draft.
            <ExerciseNote
              exerciseName={exercise.name}
              exerciseSlug={exercise.slug}
              key={workoutSessionExercise.exercise_slug}
              layout="inline"
              leavesWithoutAsking={isSessionMovingOn}
            />
          ) : null}
          <Card>
            <WorkoutSessionExerciseSetsTableView
              exerciseId={exerciseId}
              onSetLogged={handleSetLogged}
              previousSets={workoutSessionExercise.previous_sets}
              readOnly={isFinished}
              sessionId={sessionId}
              weightUnit={workoutSession.weight_unit}
              workoutSessionExerciseSets={workoutSessionExercise.sets}
            />
          </Card>
          <ExerciseHistoryView
            excludeId={exerciseId}
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
      <View className="pt-lg items-center">
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
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          scrollEdgeEffects: CLIP_SCROLL_EDGE_EFFECTS,
          title: workoutSessionExercise ? exercise.name : "",
        }}
      />
      <KeyboardAwareScrollView
        bottomOffset={
          isNotesEnabled()
            ? NOTE_KEYBOARD_BOTTOM_OFFSET
            : SET_KEYBOARD_BOTTOM_OFFSET
        }
        contentContainerClassName="gap-sm px-sm pt-xs"
        contentContainerStyle={{
          paddingBottom:
            insets.bottom +
            16 +
            (shownRest ? restTimerHeight + REST_TIMER_GAP : 0),
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
        showsVerticalScrollIndicator={false}
        testID="workout-session-exercise-scroll"
      >
        {renderContent()}
      </KeyboardAwareScrollView>
      {shownRest ? (
        <RestTimer
          bottomInset={insets.bottom}
          nextSetNumber={
            nextUnloggedSet(shownSets, shownRest.loggedSetId)?.number ?? null
          }
          onAdjust={adjustRest}
          onEnd={endRest}
          onLayout={handleRestTimerLayout}
          rest={shownRest}
        />
      ) : null}
      <WorkoutSessionFinishSuggestion
        isFinished={isFinished}
        screensAboveSession={1}
        sessionId={sessionId}
      />
    </>
  );
};

export default WorkoutSessionExerciseScreen;
