import type { ExerciseSummary } from "@fitme/library-sdk";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseRowChevron } from "~/components/exercises/exercise-row";
import ExercisesView from "~/components/views/exercises-view";

export default function LibraryScreen() {
  const { t } = useTranslation();

  const onExercisePress = useCallback((exercise: ExerciseSummary) => {
    router.push(`/exercises/${exercise.slug}`);
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("tabs.library"),
        }}
      />
      <ExercisesView
        contentContainerClassName="px-6"
        onExercisePress={onExercisePress}
        refreshable
        trailing={<ExerciseRowChevron />}
      />
    </>
  );
}
