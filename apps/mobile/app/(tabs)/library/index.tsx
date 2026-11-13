import type { ExerciseSummary } from "@fitme/library-sdk";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { ExerciseRowChevron } from "~/components/exercises/exercise-row";
import ExercisesView from "~/components/views/exercises-view";
import { useHeaderSearch } from "~/hooks/header-search";

/**
 * The Library tab's Muscle group and Equipment choices: each kept while the
 * app runs, under its own store's key.
 */
const MUSCLE_CHOICE_KEY = "library";
const EQUIPMENT_CHOICE_KEY = "library";

const LibraryScreen = () => {
  const { t } = useTranslation();
  const { onSearchChange, search, searchBarOptions } = useHeaderSearch();

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
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("tabs.library"),
        }}
      />
      <ExercisesView
        contentContainerClassName="px-sm pt-2.5"
        equipmentChoiceKey={EQUIPMENT_CHOICE_KEY}
        muscleChoiceKey={MUSCLE_CHOICE_KEY}
        onExercisePress={onExercisePress}
        onSearchChange={onSearchChange}
        refreshable
        search={search}
        trailing={<ExerciseRowChevron />}
      />
    </>
  );
};

export default LibraryScreen;
