import {
  previousSetsByOrder,
  type WorkoutSessionExerciseSet,
} from "@fitme/core";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import ExerciseHistoryView from "~/components/views/exercise-history-view";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import RestTimer, { type Rest } from "~/components/workout-sessions/rest-timer";
import SessionExerciseHeader from "~/components/workout-sessions/session-exercise-header";
import { WorkoutSessionFinishSuggestion } from "~/components/workout-sessions/workout-session-finish-suggestion";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { useWorkoutSessionExerciseQuery } from "~/hooks/queries/workout-session-exercises";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";

/** Gap between the end of the content and the floating rest timer. */
const REST_TIMER_GAP = 16;

export default function WorkoutSessionExerciseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    planId: _planId,
    workoutId: _workoutId,
    sessionId,
    exerciseId,
  } = useLocalSearchParams();

  const {
    data: workoutSessionExercise,
    isError,
    refetch,
  } = useWorkoutSessionExerciseQuery({
    variables: {
      exerciseId: exerciseId as string,
      sessionId: sessionId as string,
    },
  });

  const { data: workoutSession } = useWorkoutSessionQuery({
    variables: { sessionId: sessionId as string },
  });

  const { data: history } = useExerciseHistoryQuery({
    enabled: !!workoutSessionExercise,
    variables: { exerciseId: workoutSessionExercise?.exercise_id ?? "" },
  });
  const previousSets = useMemo(
    () => previousSetsByOrder(history ?? [], exerciseId as string),
    [history, exerciseId]
  );

  const isFinished = !!workoutSession?.finished_at;
  const [rest, setRest] = useState<Rest | null>(null);
  const [restTimerHeight, setRestTimerHeight] = useState(0);
  const exercise = workoutSessionExercise?.exercise;
  const hasGuide = !!(
    exercise?.video_url ||
    exercise?.description ||
    exercise?.instructions
  );

  const openGuide = useCallback(() => {
    if (workoutSessionExercise) {
      router.push(`/exercises/${workoutSessionExercise.exercise_id}/guide`);
    }
  }, [router, workoutSessionExercise]);

  const handleSetLogged = useCallback(
    (set: WorkoutSessionExerciseSet, nextSetOrder: number | null) => {
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

  const renderContent = () => {
    if (workoutSessionExercise) {
      return (
        <>
          <SessionExerciseHeader
            exercise={workoutSessionExercise.exercise}
            onOpenGuide={hasGuide ? openGuide : undefined}
            sets={workoutSessionExercise.sets}
          />
          <Card>
            <View className="p-2">
              <WorkoutSessionExerciseSetsTableView
                exerciseId={exerciseId as string}
                onSetLogged={handleSetLogged}
                previousSets={previousSets}
                readOnly={isFinished}
                sessionId={sessionId as string}
                workoutSessionExerciseSets={workoutSessionExercise.sets}
              />
            </View>
          </Card>
          <ExerciseHistoryView
            excludeId={exerciseId as string}
            exerciseId={workoutSessionExercise.exercise_id}
          />
        </>
      );
    }
    if (isError) {
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            Couldn't load this exercise. Check your connection and try again.
          </Text>
          <Button
            fill={false}
            label="Try Again"
            onPress={() => refetch()}
            shape="pill"
            variant="secondary"
          />
        </View>
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
          title: workoutSessionExercise?.exercise?.name ?? "",
          unstable_headerRightItems: () => {
            if (!hasGuide) {
              return [];
            }
            return [
              {
                icon: { name: "info.circle", type: "sfSymbol" },
                label: "Exercise Guide",
                onPress: openGuide,
                type: "button",
              },
            ];
          },
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
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </KeyboardAwareScrollView>
      {rest ? (
        <RestTimer
          bottomInset={insets.bottom}
          onAdjust={adjustRest}
          onEnd={endRest}
          onLayout={(event) =>
            setRestTimerHeight(event.nativeEvent.layout.height)
          }
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
