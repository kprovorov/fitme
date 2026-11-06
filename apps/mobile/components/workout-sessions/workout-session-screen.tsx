import { Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, useWindowDimensions, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { H4 } from "~/components/ui/typography";
import WorkoutSessionView from "~/components/views/workout-session-view";
import SessionLoadError from "~/components/workout-sessions/session-load-error";
import { WorkoutSessionFinishSuggestion } from "~/components/workout-sessions/workout-session-finish-suggestion";
import WorkoutSessionStats from "~/components/workout-sessions/workout-session-stats";
import { useFinishWorkoutSession } from "~/hooks/finish-workout-session";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";

/** Space kept between a focused set input and the keyboard. */
const KEYBOARD_BOTTOM_OFFSET = 62;

/** Past this text scale Finish goes under the name, which would break mid-word. */
const STACKED_FONT_SCALE = 1.4;

interface WorkoutSessionScreenProps {
  sessionId: string;
}

/**
 * A workout session: its name with Finish while it runs, its stats, then a
 * card per exercise whose sets are logged right there. Both session routes
 * (from a plan, and `/workout-sessions/:id`) render it.
 */
const WorkoutSessionScreen = ({ sessionId }: WorkoutSessionScreenProps) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACKED_FONT_SCALE;

  // A failed refresh keeps the session on screen; with none read yet it's
  // the load error.
  const {
    data: workoutSession,
    error,
    isError,
    refetch,
  } = useWorkoutSessionQuery({
    variables: { sessionId },
  });

  const { confirmFinish, isFinishing } = useFinishWorkoutSession(sessionId);

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const canFinish = !!workoutSession && !workoutSession.finished_at;

  const renderContent = () => {
    if (workoutSession) {
      return (
        <>
          <Card variant="ghost">
            <View className="gap-sm">
              <View
                className={
                  stacked
                    ? "gap-sm items-start"
                    : "gap-sm flex-row items-center"
                }
              >
                <H4 className={stacked ? undefined : "flex-1"}>
                  {workoutSession.workout?.name}
                </H4>
                {canFinish ? (
                  <Button
                    fill={false}
                    isLoading={isFinishing}
                    label={t("workoutSession.finish")}
                    onPress={confirmFinish}
                    size="lg"
                    testID="finish-workout-button"
                  />
                ) : null}
              </View>
              <WorkoutSessionStats workoutSession={workoutSession} />
            </View>
          </Card>
          <WorkoutSessionView
            sessionId={sessionId}
            workoutSession={workoutSession}
          />
        </>
      );
    }

    if (isError) {
      return (
        <SessionLoadError
          error={error}
          message={t("workoutSession.loadError")}
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
      {/* The workout's name and Finish head the content: the header only goes back. */}
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTransparent: true,
          title: "",
        }}
      />
      <KeyboardAwareScrollView
        bottomOffset={KEYBOARD_BOTTOM_OFFSET}
        contentContainerClassName="gap-sm px-sm pt-xs"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </KeyboardAwareScrollView>
      <WorkoutSessionFinishSuggestion
        isFinished={!!workoutSession?.finished_at}
        sessionId={sessionId}
      />
    </>
  );
};

export default WorkoutSessionScreen;
