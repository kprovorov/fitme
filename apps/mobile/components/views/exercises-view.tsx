import { type MuscleGroup, muscleGroups, muscleGroupToName } from "@fitme/core";
import type { ExerciseSummary } from "@fitme/exercise-library";
import type React from "react";
import { useCallback, useImperativeHandle, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import ExercisesList from "~/components/exercises/exercises-list";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Picker } from "~/components/ui/picker";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { useExerciseSearch } from "~/hooks/queries/exercise-library";

export interface ExercisesViewHandle {
  refresh: () => Promise<void>;
}

type MuscleGroupFilter = MuscleGroup | "all";

const muscleGroupOptions: { label: string; value: MuscleGroupFilter }[] = [
  { label: "All", value: "all" },
  ...muscleGroups
    // Temporary we don't have full-body and cardio exercises
    .filter((group) => !["full-body", "cardio"].includes(group))
    .map((group) => ({ label: muscleGroupToName(group), value: group })),
];

/** The Exercise Library, searched and filtered by muscle group: the Library tab and the Exercise picker. */
const ExercisesView = ({
  onExercisePress = () => {
    /* noop */
  },
  itemCta,
  initialMuscleGroup = "all",
  ref,
}: {
  onExercisePress?: (exercise: ExerciseSummary) => void;
  itemCta?: React.ReactNode | ((exercise: ExerciseSummary) => React.ReactNode);
  initialMuscleGroup?: MuscleGroupFilter;
  ref?: React.Ref<ExercisesViewHandle>;
}) => {
  const [search, setSearch] = useState("");
  const [muscleGroup, setMuscleGroup] =
    useState<MuscleGroupFilter>(initialMuscleGroup);

  const { exercises, hasMore, isError, isLoadingMore, loadMore, refetch } =
    useExerciseSearch({
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

  const clearSearch = useCallback(() => {
    setSearch("");
    setMuscleGroup("all");
  }, []);

  const renderResults = () => {
    if (exercises?.length) {
      return (
        <>
          <ExercisesList
            exercises={exercises}
            itemCta={itemCta}
            onExercisePress={onExercisePress}
          />
          {hasMore ? (
            <Button
              isLoading={isLoadingMore}
              label="Load More"
              onPress={handleLoadMore}
              variant="secondary"
            />
          ) : null}
        </>
      );
    }
    if (exercises) {
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            No exercises match. Try another name or muscle group.
          </Text>
          <Button fill={false} label="Clear Search" onPress={clearSearch} />
        </View>
      );
    }
    if (isError) {
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            Couldn't load exercises. Check your connection and try again.
          </Text>
          <Button
            fill={false}
            label="Try Again"
            onPress={retry}
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
    <VStack className="flex-1 items-stretch">
      <Input
        accessibilityLabel="Search exercises"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={setSearch}
        placeholder="Search exercises"
        returnKeyType="search"
        value={search}
      />

      <Picker
        label="Muscle group"
        onValueChange={setMuscleGroup}
        options={muscleGroupOptions}
        value={muscleGroup}
        variant="menu"
      />

      {renderResults()}
    </VStack>
  );
};
ExercisesView.displayName = "ExercisesView";

export default ExercisesView;
