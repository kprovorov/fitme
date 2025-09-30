import { Link } from "expo-router";
import React from "react";
import ExerciseImage from "~/components/exercises/exercise-image";
import { HStack } from "~/components/ui/hstack";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { Exercise } from "~/lib/models";

interface ExercisesListProps {
  exercises: Exercise[];
}

export default function ExercisesList({ exercises = [] }: ExercisesListProps) {
  return (
    <MenuList className="w-full">
      {exercises?.map((exercise: Exercise, i: number) => (
        <React.Fragment key={exercise.id}>
          {i > 0 && <Separator />}
          <Link href={`/exercises/${exercise.id}`} asChild>
            <MenuListItem icon="chevron-right" className="flex-1">
              <HStack className="flex-1">
                <ExerciseImage exercise={exercise} />
                <Text className="flex-1">{exercise.name}</Text>
              </HStack>
            </MenuListItem>
          </Link>
        </React.Fragment>
      ))}
    </MenuList>
  );
}
