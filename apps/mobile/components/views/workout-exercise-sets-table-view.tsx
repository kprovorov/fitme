import type { WorkoutExerciseSet } from "@fitme/core";
import { formatElapsed, getWeightLabel } from "@fitme/core";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { describeSetTarget, formatSetTarget } from "~/lib/set-inputs";
import { cn } from "~/lib/utils";
import {
  SET_NUMBER_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
} from "../forms/workout-exercise-set-form";
import { Text } from "../ui/text";
import { VStack } from "../ui/vstack";

/** A row's height: a Workout Session set row's, so both tables line up. */
const ROW_CLASS = "min-h-10 flex-row items-center gap-sm";

interface WorkoutExerciseSetsTableViewProps {
  sets: WorkoutExerciseSet[];
}

function Cell({
  children,
  className,
  header = false,
}: {
  children: ReactNode;
  className?: string;
  header?: boolean;
}) {
  return (
    <Text
      adjustsFontSizeToFit
      className={cn(
        "text-center text-mono-body",
        header && "text-primary",
        className
      )}
      maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

/** A set's rest as a clock (`1:30`), or `–` without one. */
const formatRest = (seconds: number) =>
  seconds > 0 ? formatElapsed(seconds * 1000) : "–";

/** How VoiceOver reads a set: one sentence, rest in seconds. */
const setLabel = (set: WorkoutExerciseSet, weightLabel: string | undefined) => {
  const target = describeSetTarget(set, weightLabel);
  const rest =
    set.rest_recommended > 0
      ? `rest ${set.rest_recommended} seconds`
      : "no rest";
  return `Set ${set.order}: ${target}, ${rest}`;
};

/**
 * A Workout Exercise's sets as planned, read-only: each set's target reps ×
 * weight in the Profile's unit, and its recommended rest.
 */
export default function WorkoutExerciseSetsTableView({
  sets,
}: WorkoutExerciseSetsTableViewProps) {
  const { data: profile, isPending: isProfilePending } = useProfileQuery();
  const weightLabel = getWeightLabel(profile?.measurement_system ?? "metric");

  return (
    !isProfilePending && (
      <VStack className="items-stretch gap-sm">
        <View
          accessibilityElementsHidden
          className="flex-row items-center gap-sm"
          importantForAccessibility="no-hide-descendants"
        >
          <Cell className={SET_NUMBER_COLUMN_CLASS} header>
            #
          </Cell>
          <Cell className="flex-1" header>
            target
          </Cell>
          <Cell className="flex-1" header>
            rest
          </Cell>
        </View>

        {[...sets]
          .sort((a, b) => a.order - b.order)
          .map((set) => (
            <View
              accessibilityLabel={setLabel(set, weightLabel)}
              accessible
              className={ROW_CLASS}
              key={set.id}
            >
              <Cell className={SET_NUMBER_COLUMN_CLASS}>{`#${set.order}`}</Cell>
              <Cell className="flex-1">
                {formatSetTarget(set, weightLabel)}
              </Cell>
              <Cell className="flex-1 text-muted-foreground">
                {formatRest(set.rest_recommended)}
              </Cell>
            </View>
          ))}
      </VStack>
    )
  );
}
