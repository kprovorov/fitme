import type { Exercise } from "@fitme/core";
import type React from "react";
import ExerciseImage from "~/components/exercises/exercise-image";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Text } from "~/components/ui/text";
import { cn } from "~/lib/utils";

interface ExercisesListProps {
  exercises: Exercise[];
  itemCta?: React.ReactNode | ((exercise: Exercise) => React.ReactNode);
  itemIcon?: "chevron-right" | "square-arrow-out-up-right";
  onExercisePress?: (exercise: Exercise) => void;
}

export default function ExercisesList({
  exercises,
  itemIcon,
  itemCta,
  onExercisePress = () => {
    /* noop */
  },
}: ExercisesListProps) {
  return (
    <MenuList className="w-full">
      {exercises.map((exercise: Exercise, index: number) => (
        <MenuListItem
          className={cn("flex-1", {
            "border-border border-t": index > 0,
          })}
          icon={itemIcon}
          key={exercise.id}
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
