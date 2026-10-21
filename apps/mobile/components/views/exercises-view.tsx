import { type Exercise, muscleGroups, muscleGroupToName } from "@fitme/core";
import type React from "react";
import { useCallback, useImperativeHandle, useState } from "react";
import ExercisesList from "~/components/exercises/exercises-list";
import { Button } from "~/components/ui/button";
import { Picker } from "~/components/ui/picker";
import { VStack } from "~/components/ui/vstack";
import { useExercisesQuery } from "~/hooks/queries/exercises";

export interface ExercisesViewHandle {
  refresh: () => Promise<void>;
}

const ExercisesView = ({
  onExercisePress = () => {
    /* noop */
  },
  itemCta,
  initialMuscleGroup = "all",
  ref,
}: {
  onExercisePress?: (exercise: Exercise) => void;
  onAddExercisePress?: () => void;
  itemCta?: React.ReactNode | ((exercise: Exercise) => React.ReactNode);
  initialMuscleGroup?: string;
  ref?: React.Ref<ExercisesViewHandle>;
}) => {
  const [muscleGroup, setMuscleGroup] = useState<string>(initialMuscleGroup);

  const muscleGroupOptions = [
    { label: "All", value: "all" },
    ...muscleGroups
      // Temporary we don't have full-body and cardio exercises
      .filter((group) => !["full-body", "cardio"].includes(group))
      .map((group) => ({ label: muscleGroupToName(group), value: group })),
  ];

  const {
    data: exercises,
    refetch: refetchExercises,
    hasNextPage,
    fetchNextPage,
  } = useExercisesQuery({
    variables: {
      muscleGroup: muscleGroup === "all" ? undefined : muscleGroup,
    },
  });

  const refresh = useCallback(async () => {
    await refetchExercises();
  }, [refetchExercises]);

  useImperativeHandle(ref, () => ({ refresh }), [refresh]);

  const loadMore = useCallback(() => {
    fetchNextPage();
  }, [fetchNextPage]);

  return (
    <VStack className="flex-1 items-stretch">
      <Picker
        label="Muscle group"
        onValueChange={setMuscleGroup}
        options={muscleGroupOptions}
        value={muscleGroup}
        variant="menu"
      />

      <ExercisesList
        exercises={exercises?.pages?.flatMap((page) => page.data) || []}
        itemCta={itemCta}
        onExercisePress={onExercisePress}
      />

      {hasNextPage ? (
        <Button label="Load more..." onPress={loadMore} variant="secondary" />
      ) : null}
    </VStack>
  );
};
ExercisesView.displayName = "ExercisesView";

export default ExercisesView;
