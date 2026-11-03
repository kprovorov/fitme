import { formatDate } from "@fitme/i18n";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WorkoutSessionSummaryView from "~/components/views/workout-session-summary-view";
import SessionLoadError from "~/components/workout-sessions/session-load-error";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { useI18n } from "~/lib/i18n";

export default function WorkoutSessionSummaryScreen() {
  const { workoutSessionId } = useLocalSearchParams();
  const router = useRouter();
  const i18n = useI18n();
  const { t } = useTranslation();

  // Finishing shows its answer here with no re-read; opened any other way
  // the session is read, and a failed read with none shown is the load error.
  const {
    data: workoutSession,
    error,
    isError,
    refetch,
  } = useWorkoutSessionQuery({
    variables: {
      sessionId: workoutSessionId as string,
    },
  });
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const insets = useSafeAreaInsets();

  const handleContinue = useCallback(() => router.replace("/"), [router]);

  const renderContent = () => {
    if (workoutSession) {
      return (
        <WorkoutSessionSummaryView
          onContinue={handleContinue}
          workoutSession={workoutSession}
        />
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
        {renderContent()}
      </ScrollView>
    </>
  );
}
