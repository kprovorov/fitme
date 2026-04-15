import React, { useCallback, useImperativeHandle, useState } from "react";
import { ScrollView } from "react-native";
import ExercisesList from "~/components/exercises/exercises-list";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { useExercisesQuery } from "~/hooks/queries/exercises";
import { type Exercise, muscleGroups } from "~/lib/models";
import { muscleGroupToName } from "~/lib/utils";

export interface ExercisesViewHandle {
  refresh: () => Promise<void>;
}

const ExercisesView = React.forwardRef<
  ExercisesViewHandle,
  React.HTMLProps<HTMLDivElement> & {
    onExercisePress?: (exercise: Exercise) => void;
    onAddExercisePress?: () => void;
    itemCta?: React.ReactNode | ((exercise: Exercise) => React.ReactNode);
    initialMuscleGroup?: string;
  }
>(
  (
    {
      onExercisePress = () => {
        /* noop */
      },
      itemCta,
      initialMuscleGroup = "all",
    },
    ref
  ) => {
    const [muscleGroup, setMuscleGroup] = useState<string>(initialMuscleGroup);

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
        <Tabs onValueChange={setMuscleGroup} value={muscleGroup}>
          <TabsList>
            <ScrollView
              horizontal
              scrollToOverflowEnabled={true}
              showsHorizontalScrollIndicator={false}
            >
              <TabsTrigger value="all">
                <Text>All</Text>
              </TabsTrigger>
              {muscleGroups
                // Temporary we don't have full-body and cardio exercises
                .filter(
                  (muscleGroup) =>
                    !["full-body", "cardio"].includes(muscleGroup)
                )
                .map((muscleGroup) => (
                  <TabsTrigger key={muscleGroup} value={muscleGroup}>
                    <Text>{muscleGroupToName(muscleGroup)}</Text>
                  </TabsTrigger>
                ))}
            </ScrollView>
          </TabsList>
        </Tabs>

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
  }
);
ExercisesView.displayName = "ExercisesView";

export default ExercisesView;
