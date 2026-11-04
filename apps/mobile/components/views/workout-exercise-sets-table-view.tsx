import { formatElapsed } from "@fitme/core";
import { type Translator, unitName } from "@fitme/i18n";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { FullPlan, PlanSet } from "~/hooks/queries/plans";
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
  sets: PlanSet[];
  /** The unit its weights are in, from the Plan's own read. */
  weightUnit: FullPlan["weight_unit"];
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
const setLabel = (translator: Translator, set: PlanSet, weightLabel: string) =>
  translator.t("sets.plannedSet", {
    order: set.order,
    rest:
      set.rest_recommended > 0
        ? translator.t("sets.restSeconds", { count: set.rest_recommended })
        : translator.t("sets.noRest"),
    target: describeSetTarget(set, weightLabel, translator),
  });

/**
 * A Workout Exercise's sets as planned, read-only: each set's target reps ×
 * weight in the Plan's own unit, and its recommended rest.
 */
export default function WorkoutExerciseSetsTableView({
  sets,
  weightUnit,
}: WorkoutExerciseSetsTableViewProps) {
  const { i18n, t } = useTranslation();
  const weightLabel = unitName(i18n, weightUnit);

  return (
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
          {t("sets.columns.target")}
        </Cell>
        <Cell className="flex-1" header>
          {t("sets.columns.rest")}
        </Cell>
      </View>

      {[...sets]
        .sort((a, b) => a.order - b.order)
        .map((set) => (
          <View
            accessibilityLabel={setLabel(i18n, set, weightLabel)}
            accessible
            className={ROW_CLASS}
            key={set.id}
          >
            <Cell className={SET_NUMBER_COLUMN_CLASS}>{`#${set.order}`}</Cell>
            <Cell className="flex-1">{formatSetTarget(set, weightLabel)}</Cell>
            <Cell className="flex-1 text-muted-foreground">
              {formatRest(set.rest_recommended)}
            </Cell>
          </View>
        ))}
    </VStack>
  );
}
