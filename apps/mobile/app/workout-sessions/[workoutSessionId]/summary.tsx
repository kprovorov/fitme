import { formatDate } from "@fitme/i18n";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WorkoutSessionSummaryView from "~/components/views/workout-session-summary-view";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { useI18n } from "~/lib/i18n";

export default function WorkoutSessionSummaryScreen() {
  const { workoutSessionId } = useLocalSearchParams();
  const router = useRouter();
  const i18n = useI18n();

  const { data: workoutSession } = useWorkoutSessionQuery({
    variables: {
      sessionId: workoutSessionId as string,
    },
  });

  const insets = useSafeAreaInsets();

  const handleContinue = useCallback(() => router.replace("/"), [router]);

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
          title: workoutSession
            ? formatDate(
                i18n,
                new Date(workoutSession.started_at),
                "weekdayDayMonthYear"
              )
            : "",
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
        {workoutSession ? (
          <WorkoutSessionSummaryView
            onContinue={handleContinue}
            workoutSession={workoutSession}
          />
        ) : null}
      </ScrollView>
    </>
  );
}
