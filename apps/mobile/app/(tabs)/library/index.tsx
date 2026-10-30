import type { ExerciseSummary } from "@fitme/library-sdk";
import { router, Stack } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SearchBarCommands } from "react-native-screens";
import { ExerciseRowChevron } from "~/components/exercises/exercise-row";
import ExercisesView from "~/components/views/exercises-view";

export default function LibraryScreen() {
  const { t } = useTranslation();
  // The native header search bar holds the text; the view searches with it.
  const searchBar = useRef<SearchBarCommands | null>(null);
  const [search, setSearch] = useState("");

  const onExercisePress = useCallback((exercise: ExerciseSummary) => {
    router.push(`/exercises/${exercise.slug}`);
  }, []);

  // "Show All Exercises" clears the header's text too.
  const onSearchChange = useCallback((text: string) => {
    setSearch(text);
    if (text === "") {
      searchBar.current?.clearText();
    }
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerSearchBarOptions: {
            autoCapitalize: "none",
            // Hidden until the User pulls the list down.
            hideWhenScrolling: true,
            onCancelButtonPress: () => setSearch(""),
            onClose: () => setSearch(""),
            onChangeText: ({ nativeEvent }) => setSearch(nativeEvent.text),
            placeholder: t("library.search"),
            placement: "stacked",
            ref: searchBar,
          },
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
