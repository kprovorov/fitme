import { Stack } from "expo-router";
import { ActivityIndicator, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResolveClassNames } from "uniwind";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import WorkoutSessionView from "~/components/views/workout-session-view";
import { WorkoutSessionFinishSuggestion } from "~/components/workout-sessions/workout-session-finish-suggestion";
import WorkoutSessionStats from "~/components/workout-sessions/workout-session-stats";
import { useFinishWorkoutSession } from "~/hooks/finish-workout-session";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";

interface WorkoutSessionScreenProps {
  sessionId: string;
}

/**
 * A workout session's exercises with its stats, and Finish in the header
 * while it runs. Both session routes (from a plan, and
 * `/workout-sessions/:id`) render it.
 */
export default function WorkoutSessionScreen({
  sessionId,
}: WorkoutSessionScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    data: workoutSession,
    isError,
    refetch,
  } = useWorkoutSessionQuery({
    variables: { sessionId },
  });

  const { confirmFinish, isFinishing } = useFinishWorkoutSession(sessionId);
  const primary = useResolveClassNames("text-primary").color;
  const primaryForeground = useResolveClassNames(
    "text-primary-foreground"
  ).color;
  const canFinish = !!workoutSession && !workoutSession.finished_at;

  const renderContent = () => {
    if (workoutSession) {
      return (
        <>
          <WorkoutSessionStats workoutSession={workoutSession} />
          <WorkoutSessionView
            sessionId={sessionId}
            workoutSession={workoutSession}
          />
          {/* Header items are iOS only: elsewhere Finish stays in the content. */}
          {canFinish && Platform.OS !== "ios" ? (
            <Button
              isLoading={isFinishing}
              label="Finish Workout"
              onPress={confirmFinish}
              shape="pill"
              testID="finish-workout-button"
            />
          ) : null}
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
          title: workoutSession?.workout?.name ?? "",
          unstable_headerRightItems: () =>
            canFinish
              ? [
                  {
                    disabled: isFinishing,
                    label: "Finish",
                    labelStyle: {
                      color: primaryForeground,
                      fontFamily: "NunitoSans12pt-Bold",
                      fontWeight: "bold",
                    },
                    onPress: confirmFinish,
                    tintColor: primary,
                    type: "button",
                    variant: "prominent",
                  },
                ]
              : [],
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
      <WorkoutSessionFinishSuggestion
        isFinished={!!workoutSession?.finished_at}
        sessionId={sessionId}
      />
    </>
  );
}
