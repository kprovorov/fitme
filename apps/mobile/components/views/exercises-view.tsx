import { type MuscleGroup, muscleGroups } from "@fitme/core";
import type { ExerciseSummary } from "@fitme/library-sdk";
import type React from "react";
import { useCallback, useImperativeHandle, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import ExercisesList, {
  type ExerciseRowTrailing,
} from "~/components/exercises/exercises-list";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { Picker } from "~/components/ui/picker";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useExerciseSearch } from "~/hooks/queries/library";
import { type ChoiceLabels, useChoiceLabels } from "~/lib/choices";
import { i18n } from "~/lib/i18n";

export interface ExercisesViewHandle {
  refresh: () => Promise<void>;
}

type MuscleGroupFilter = MuscleGroup | "all";

const muscleGroupOptions = (
  labels: ChoiceLabels,
  allLabel: string
): { label: string; value: MuscleGroupFilter }[] => [
  { label: allLabel, value: "all" },
  ...muscleGroups
    // Temporary we don't have full-body and cardio exercises
    .filter((group) => !["full-body", "cardio"].includes(group))
    .map((group) => ({ label: labels.muscleGroup(group), value: group })),
];

/** The Library, searched and filtered by muscle group: the Library tab and the Exercise picker. */
const ExercisesView = ({
  onExercisePress = () => {
    /* noop */
  },
  trailing,
  initialMuscleGroup = "all",
  ref,
}: {
  onExercisePress?: (exercise: ExerciseSummary) => void;
  // What ends each row: the Library's chevron, or the picker's CTA.
  trailing?: ExerciseRowTrailing;
  initialMuscleGroup?: MuscleGroupFilter;
  ref?: React.Ref<ExercisesViewHandle>;
}) => {
  const { t } = useTranslation(undefined, { i18n });
  const labels = useChoiceLabels();
  const filterOptions = useMemo(
    () => muscleGroupOptions(labels, t("library.allMuscleGroups")),
    [labels, t]
  );
  const [search, setSearch] = useState("");
  const [muscleGroup, setMuscleGroup] =
    useState<MuscleGroupFilter>(initialMuscleGroup);

  const {
    exercises,
    hasMore,
    isError,
    isLoadMoreError,
    isLoadingMore,
    loadMore,
    refetch,
  } = useExerciseSearch({
    muscleGroup: muscleGroup === "all" ? undefined : muscleGroup,
    search,
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  const handleLoadMore = useCallback(() => {
    loadMore();
  }, [loadMore]);

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const showAll = useCallback(() => {
    setSearch("");
    setMuscleGroup("all");
  }, []);

  const renderResults = () => {
    if (isError) {
      return (
        <VStack className="items-center gap-sm pt-lg">
          <H3 className="text-center">{t("library.loadErrorTitle")}</H3>
          <Text className="text-center text-muted-foreground">
            {t("library.loadError")}
          </Text>
          <Button
            fill={false}
            label={t("common.tryAgain")}
            onPress={retry}
            variant="secondary"
          />
        </VStack>
      );
    }
    if (exercises?.length) {
      return (
        <>
          <ExercisesList
            exercises={exercises}
            onExercisePress={onExercisePress}
            trailing={trailing}
          />
          {isLoadMoreError ? (
            <ErrorMessage className="text-center">
              {t("library.loadMoreError")}
            </ErrorMessage>
          ) : null}
          {hasMore ? (
            <Button
              isLoading={isLoadingMore}
              label={t("library.loadMore")}
              onPress={handleLoadMore}
              variant="secondary"
            />
          ) : null}
        </>
      );
    }
    if (exercises) {
      return (
        <VStack className="items-center gap-sm pt-lg">
          <H3 className="text-center">{t("library.emptyTitle")}</H3>
          <Text className="text-center text-muted-foreground">
            {t("library.empty")}
          </Text>
          <Button fill={false} label={t("library.showAll")} onPress={showAll} />
        </VStack>
      );
    }
    return (
      <View className="items-center pt-lg">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  };

  return (
    <VStack className="flex-1 items-stretch">
      <Input
        accessibilityLabel={t("library.search")}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={setSearch}
        placeholder={t("library.search")}
        returnKeyType="search"
        value={search}
      />

      <Picker
        label={t("library.muscleGroup")}
        onValueChange={setMuscleGroup}
        options={filterOptions}
        value={muscleGroup}
        variant="menu"
      />

      {renderResults()}
    </VStack>
  );
};
ExercisesView.displayName = "ExercisesView";

export default ExercisesView;
