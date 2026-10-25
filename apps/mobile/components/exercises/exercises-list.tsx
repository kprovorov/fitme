import type { ExerciseSummary } from "@fitme/library-sdk";
import type React from "react";
import { useCallback } from "react";
import ExerciseImage from "~/components/exercises/exercise-image";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

type ItemCta =
  | React.ReactNode
  | ((exercise: ExerciseSummary) => React.ReactNode);

interface ExercisesListProps {
  exercises: ExerciseSummary[];
  itemCta?: ItemCta;
  itemIcon?: "chevron-right" | "square-arrow-out-up-right";
  onExercisePress?: (exercise: ExerciseSummary) => void;
}

const noop = () => {
  /* noop */
};

export default function ExercisesList({
  exercises,
  itemIcon,
  itemCta,
  onExercisePress = noop,
}: ExercisesListProps) {
  return (
    <MenuList className="w-full">
      {exercises.map((exercise: ExerciseSummary, index: number) => (
        <ExercisesListItem
          exercise={exercise}
          isFirst={index === 0}
          itemCta={itemCta}
          itemIcon={itemIcon}
          key={exercise.slug}
          onExercisePress={onExercisePress}
        />
      ))}
    </MenuList>
  );
}

interface ExercisesListItemProps {
  exercise: ExerciseSummary;
  isFirst: boolean;
  itemCta?: ItemCta;
  itemIcon?: ExercisesListProps["itemIcon"];
  onExercisePress: (exercise: ExerciseSummary) => void;
}

function ExercisesListItem({
  exercise,
  isFirst,
  itemCta,
  itemIcon,
  onExercisePress,
}: ExercisesListItemProps) {
  const handlePress = useCallback(
    () => onExercisePress(exercise),
    [exercise, onExercisePress]
  );
  const cta = typeof itemCta === "function" ? itemCta(exercise) : itemCta;

  return (
    <MenuListItem
      className={cn("flex-1", {
        "border-border border-t": !isFirst,
      })}
      icon={itemIcon}
      onPress={handlePress}
    >
      <ExerciseImage exercise={exercise} />
      <Text className="flex-1">{exercise.name}</Text>
      {cta}
    </MenuListItem>
  );
}
