import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WorkoutSessionSummaryView from "~/components/views/workout-session-summary-view";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";

export default function WorkoutSessionSummaryScreen() {
  const { workoutSessionId } = useLocalSearchParams();
  const router = useRouter();

  const { data: workoutSession } = useWorkoutSessionQuery({
    variables: {
      sessionId: workoutSessionId as string,
    },
  });

  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: workoutSession
            ? new Date(workoutSession.started_at).toLocaleDateString(
                undefined,
                {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }
              )
            : "",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
        }}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {workoutSession && (
          <WorkoutSessionSummaryView
            onContinue={() => router.replace("/")}
            workoutSession={workoutSession}
          />
        )}
      </ScrollView>
    </>
  );
}
