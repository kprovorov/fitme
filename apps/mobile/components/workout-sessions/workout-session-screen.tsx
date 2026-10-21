import { Stack } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, useWindowDimensions, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Text } from "~/components/ui/text";
import { H4 } from "~/components/ui/typography";
import WorkoutSessionView from "~/components/views/workout-session-view";
import { WorkoutSessionFinishSuggestion } from "~/components/workout-sessions/workout-session-finish-suggestion";
import WorkoutSessionStats from "~/components/workout-sessions/workout-session-stats";
import { useFinishWorkoutSession } from "~/hooks/finish-workout-session";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { cn } from "~/lib/utils";

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
export default function WorkoutSessionScreen({
  sessionId,
}: WorkoutSessionScreenProps) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACKED_FONT_SCALE;
  const {
    data: workoutSession,
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
          <Card className="gap-sm" variant="ghost">
            <View
              className={
                stacked ? "items-start gap-sm" : "flex-row items-center gap-sm"
              }
            >
              <H4
                className={cn(
                  "font-nunito-sans-bold text-primary",
                  !stacked && "flex-1"
                )}
              >
                {workoutSession.workout?.name}
              </H4>
              {canFinish ? (
                <Button
                  fill={false}
                  isLoading={isFinishing}
                  label="Finish"
                  onPress={confirmFinish}
                  shape="pill"
                  size="sm"
                  testID="finish-workout-button"
                />
              ) : null}
            </View>
            <WorkoutSessionStats workoutSession={workoutSession} />
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
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            Couldn't load this workout. Check your connection and try again.
          </Text>
          <Button
            fill={false}
            label="Try Again"
            onPress={retry}
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
}
