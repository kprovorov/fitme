import React from "react";
import ExerciseImage from "~/components/exercises/exercise-image";
import { HStack } from "~/components/ui/hstack";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Text } from "~/components/ui/text";
import { Exercise } from "~/lib/models";
import { cn } from "~/lib/utils";

interface ExercisesListProps {
  exercises: Exercise[];
  onExercisePress?: (exercise: Exercise) => void;
}

export default function ExercisesList({
  exercises,
  onExercisePress = () => {},
}: ExercisesListProps) {
  return (
    <MenuList className="w-full">
      {exercises.map((exercise: Exercise, index: number) => (
        <MenuListItem
          key={exercise.id}
          icon="chevron-right"
          className={cn("flex-1", {
            "border-t border-border": index > 0,
          })}
          onPress={() => onExercisePress(exercise)}
        >
          <HStack className="flex-1">
            <ExerciseImage exercise={exercise} />
            <Text className="flex-1">{exercise.name}</Text>
          </HStack>
        </MenuListItem>
      ))}
    </MenuList>
  );
}
