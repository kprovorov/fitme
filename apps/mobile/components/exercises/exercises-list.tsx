import type { ExerciseSummary } from "@fitme/library-sdk";
import type React from "react";
import { Fragment, useCallback } from "react";
import { View } from "react-native";
import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { useChoiceLabels } from "~/lib/choices";

/** What ends each row: the same for every row, or chosen per Exercise. */
export type ExerciseRowTrailing =
  | React.ReactNode
  | ((exercise: ExerciseSummary) => React.ReactNode);

interface ExercisesListProps {
  exercises: ExerciseSummary[];
  onExercisePress?: (exercise: ExerciseSummary) => void;
  trailing?: ExerciseRowTrailing;
}

const noop = () => {
  /* noop */
};

/** The accent chevron ending a row that opens the Exercise. */
export function ExerciseRowChevron() {
  return (
    <SymbolImage
      className="shrink-0 text-body-emphasized text-primary"
      name="chevron.right"
    />
  );
}

/** Exercises as an inset grouped list: thumbnail, name and Muscle groups. */
export default function ExercisesList({
  exercises,
  trailing,
  onExercisePress = noop,
}: ExercisesListProps) {
  return (
    <MenuList className="w-full">
      {exercises.map((exercise: ExerciseSummary, index: number) => (
        <Fragment key={exercise.slug}>
          {index > 0 && <Separator className="mx-sm w-auto" />}
          <ExercisesListItem
            exercise={exercise}
            onExercisePress={onExercisePress}
            trailing={trailing}
          />
        </Fragment>
      ))}
    </MenuList>
  );
}

interface ExercisesListItemProps {
  exercise: ExerciseSummary;
  onExercisePress: (exercise: ExerciseSummary) => void;
  trailing?: ExerciseRowTrailing;
}

function ExercisesListItem({
  exercise,
  onExercisePress,
  trailing,
}: ExercisesListItemProps) {
  const labels = useChoiceLabels();
  const handlePress = useCallback(
    () => onExercisePress(exercise),
    [exercise, onExercisePress]
  );
  const shownTrailing =
    typeof trailing === "function" ? trailing(exercise) : trailing;

  return (
    <MenuListItem className="gap-sm p-sm" onPress={handlePress}>
      <ExerciseImage exercise={exercise} radius={10} size={50} />
      <View className="flex-1">
        <Text className="text-body-emphasized">{exercise.name}</Text>
        {exercise.muscle_groups.length > 0 && (
          <Text className="text-footnote text-muted-foreground">
            {exercise.muscle_groups.map(labels.muscleGroup).join(", ")}
          </Text>
        )}
      </View>
      {shownTrailing}
    </MenuListItem>
  );
}
