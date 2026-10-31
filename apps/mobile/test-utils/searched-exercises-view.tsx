/**
 * `ExercisesView` as a screen hosts it: the search text held outside the list,
 * in a text field labelled like the header's search bar (`library.search`, in
 * the App language), which "Show All Exercises" clears. For tests rendering
 * the view on its own; a screen test renders the screen's real header instead
 * (`stack-screen-stub`, `router-stub`).
 */
import { type ComponentProps, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextInput } from "react-native";
import ExercisesView from "~/components/views/exercises-view";

export function SearchedExercisesView(
  props: Omit<ComponentProps<typeof ExercisesView>, "onSearchChange" | "search">
) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  return (
    <>
      <TextInput
        accessibilityLabel={t("library.search")}
        onChangeText={setSearch}
        value={search}
      />
      <ExercisesView {...props} onSearchChange={setSearch} search={search} />
    </>
  );
}
