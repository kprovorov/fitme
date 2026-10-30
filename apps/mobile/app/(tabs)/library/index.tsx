import type { ExerciseSummary } from "@fitme/library-sdk";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseRowChevron } from "~/components/exercises/exercise-row";
import ExercisesView from "~/components/views/exercises-view";
import { useHeaderSearch } from "~/hooks/header-search";

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { onSearchChange, search, searchBarOptions } = useHeaderSearch(
    t("library.search")
  );

  const onExercisePress = useCallback((exercise: ExerciseSummary) => {
    router.push(`/exercises/${exercise.slug}`);
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerSearchBarOptions: searchBarOptions,
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
        onSearchChange={onSearchChange}
        refreshable
        search={search}
        trailing={<ExerciseRowChevron />}
      />
    </>
  );
}
