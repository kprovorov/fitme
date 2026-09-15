import type React from "react";
import { useCallback, useImperativeHandle, useState } from "react";
import ExercisesList from "~/components/exercises/exercises-list";
import { Button } from "~/components/ui/button";
import { Picker } from "~/components/ui/picker";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { useExercisesQuery } from "~/hooks/queries/exercises";
import { type Exercise, muscleGroups } from "~/lib/models";
import { muscleGroupToName } from "~/lib/utils";

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
}: (React.HTMLProps<HTMLDivElement> & {
  onExercisePress?: (exercise: Exercise) => void;
  onAddExercisePress?: () => void;
  itemCta?: React.ReactNode | ((exercise: Exercise) => React.ReactNode);
  initialMuscleGroup?: string;
}) & { ref?: React.RefObject<ExercisesViewHandle | null> }) => {
  const [muscleGroup, setMuscleGroup] = useState<string>(initialMuscleGroup);

  const muscleGroupOptions = [
    { value: "all", label: "All" },
    ...muscleGroups
      // Temporary we don't have full-body and cardio exercises
      .filter((group) => !["full-body", "cardio"].includes(group))
      .map((group) => ({ value: group, label: muscleGroupToName(group) })),
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

      {hasNextPage && (
        <Button onPress={() => fetchNextPage()} variant="secondary">
          <Text>Load more...</Text>
        </Button>
      )}
    </VStack>
  );
};
ExercisesView.displayName = "ExercisesView";

export default ExercisesView;
