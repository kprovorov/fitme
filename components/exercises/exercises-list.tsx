import React from "react";
import ExerciseImage from "~/components/exercises/exercise-image";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Text } from "~/components/ui/text";
import { Exercise } from "~/lib/models";
import { cn } from "~/lib/utils";

interface ExercisesListProps {
  exercises: Exercise[];
  itemIcon?: "chevron-right" | "square-arrow-out-up-right";
  itemCta?: React.ReactNode | ((exercise: Exercise) => React.ReactNode);
  onExercisePress?: (exercise: Exercise) => void;
}

export default function ExercisesList({
  exercises,
  itemIcon,
  itemCta,
  onExercisePress = () => {},
}: ExercisesListProps) {
  return (
    <MenuList className="w-full">
      {exercises.map((exercise: Exercise, index: number) => (
        <MenuListItem
          key={exercise.id}
          icon={itemIcon}
          className={cn("flex-1", {
            "border-t border-border": index > 0,
          })}
          onPress={() => onExercisePress(exercise)}
        >
          <ExerciseImage exercise={exercise} />
          <Text className="flex-1">{exercise.name}</Text>
          {typeof itemCta === "function" ? itemCta(exercise) : itemCta}
        </MenuListItem>
      ))}
    </MenuList>
  );
}
