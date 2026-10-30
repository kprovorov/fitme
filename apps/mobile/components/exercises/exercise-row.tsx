import type { ExerciseSummary } from "@fitme/library-sdk";
import type React from "react";
import { useCallback } from "react";
import { View } from "react-native";
import ExerciseImage from "~/components/exercises/exercise-image";
import { SymbolImage } from "~/components/symbol-image";
import { MenuListItem } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { useChoiceLabels } from "~/lib/choices";
import { cn } from "~/lib/utils";

/** What ends each row: the same for every row, or chosen per Exercise. */
export type ExerciseRowTrailing =
  | React.ReactNode
  | ((exercise: ExerciseSummary) => React.ReactNode);

/** The accent chevron ending a row that opens the Exercise. */
export function ExerciseRowChevron() {
  return (
    <SymbolImage
      className="shrink-0 text-body-emphasized text-primary"
      name="chevron.right"
    />
  );
}

/** The line between two rows, inset like a `MenuList`'s, on the rows' card surface. */
export function ExerciseRowSeparator() {
  return (
    <View className="bg-card">
      <Separator className="mx-sm w-auto" />
    </View>
  );
}

interface ExerciseRowProps {
  exercise: ExerciseSummary;
  isFirst: boolean;
  isLast: boolean;
  onExercisePress: (exercise: ExerciseSummary) => void;
  trailing?: ExerciseRowTrailing;
}

/**
 * One Exercise of an inset grouped list (thumbnail, name and Muscle groups),
 * drawn on its own so a virtualised list can render it: the first row rounds
 * the group's top corners, the last its bottom ones, as a `MenuList` would.
 */
export function ExerciseRow({
  exercise,
  isFirst,
  isLast,
  onExercisePress,
  trailing,
}: ExerciseRowProps) {
  const labels = useChoiceLabels();
  const handlePress = useCallback(
    () => onExercisePress(exercise),
    [exercise, onExercisePress]
  );
  const shownTrailing =
    typeof trailing === "function" ? trailing(exercise) : trailing;

  return (
    <View
      className={cn(
        "overflow-hidden border-continuous bg-card",
        isFirst && "rounded-t-card",
        isLast && "rounded-b-card"
      )}
    >
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
    </View>
  );
}
