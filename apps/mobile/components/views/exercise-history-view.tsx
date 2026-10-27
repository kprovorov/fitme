import {
  getWeightLabel,
  type WorkoutSessionExercise,
  type WorkoutSessionExerciseSet,
} from "@fitme/core";
import { format, isThisYear } from "date-fns";
import { type ReactNode, useCallback, useState } from "react";
import { View } from "react-native";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { formatSetTarget, formatSetWeight } from "~/lib/set-inputs";
import { cn } from "~/lib/utils";
import {
  SET_CHECK_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
} from "../forms/workout-exercise-set-form";
import { Button } from "../ui/button";
import { Card, CardTitle } from "../ui/card";
import { Text } from "../ui/text";

interface ExerciseHistoryViewProps {
  /** The session exercise being logged, left out of its own history. */
  excludeId?: string;
  /** The Exercise, by its Exercise slug. */
  exerciseSlug: string;
}

/** How many past sessions the card lists at first, and adds on Load more. */
const SESSIONS_PAGE = 3;

/** `21 October`, with the year once it's not this one. */
const sessionDate = (date: Date) =>
  format(date, isThisYear(date) ? "d MMMM" : "d MMMM yyyy");

const isLogged = (set: WorkoutSessionExerciseSet) =>
  set.reps_completed !== null;

const hasLoggedSet = (entry: WorkoutSessionExercise) =>
  entry.sets.some(isLogged);

/**
 * A cell of the table, in the Log Table's columns: `#` and target at fixed
 * widths, reps and weight sharing the rest, then the check column's spacer.
 */
function Cell({
  children,
  className,
  header = false,
}: {
  children: ReactNode;
  className: string;
  header?: boolean;
}) {
  return (
    <Text
      adjustsFontSizeToFit
      className={cn(
        "text-center",
        header
          ? "text-mono-body-semibold text-primary"
          : "text-foreground text-mono-body",
        className
      )}
      maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

function Row({
  accessibilityLabel,
  children,
}: {
  /** What VoiceOver reads for the row, as one element. */
  accessibilityLabel?: string;
  children: ReactNode;
}) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessible={!!accessibilityLabel}
      className="h-10 flex-row items-center gap-sm"
    >
      {children}
      <View className={SET_CHECK_COLUMN_CLASS} />
    </View>
  );
}

/** One past session: its date, then its logged sets as a table. */
function SessionTable({
  entry,
  weightLabel,
}: {
  entry: WorkoutSessionExercise;
  weightLabel: string | undefined;
}) {
  const logged = entry.sets.filter(isLogged).sort((a, b) => a.order - b.order);
  return (
    <View>
      <Text className="text-muted-foreground text-subhead">
        {sessionDate(new Date(entry.created_at))}
      </Text>
      <View className="gap-sm">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Row>
            <Cell className="w-7" header>
              #
            </Cell>
            <Cell className="w-20" header>
              target
            </Cell>
            <Cell className="flex-1" header>
              reps
            </Cell>
            <Cell className="flex-1" header>
              {weightLabel}
            </Cell>
          </Row>
        </View>
        {logged.map((set) => {
          const target = formatSetTarget(set, weightLabel);
          // Bodyweight sets log no weight.
          const weight =
            set.weight_completed === null
              ? null
              : formatSetWeight(set.weight_completed);
          const done = [
            `${set.reps_completed} reps`,
            weight === null ? null : `${weight} ${weightLabel ?? ""}`.trim(),
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <Row
              accessibilityLabel={`Set ${set.order}: ${done}. Target ${target}`}
              key={set.id}
            >
              <Cell className="w-7">{`#${set.order}`}</Cell>
              <Cell className="w-20">{target}</Cell>
              <Cell className="flex-1">{set.reps_completed}</Cell>
              <Cell className="flex-1">{weight ?? "–"}</Cell>
            </Row>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Progress: the exercise's past sessions, newest first, each a table of its
 * logged sets, a few at a time.
 */
export default function ExerciseHistoryView({
  exerciseSlug,
  excludeId,
}: ExerciseHistoryViewProps) {
  const { data: items } = useExerciseHistoryQuery({
    variables: { exerciseSlug },
  });
  const { data: profile } = useProfileQuery();
  const weightLabel = getWeightLabel(profile?.measurement_system ?? "metric");
  const [shown, setShown] = useState(SESSIONS_PAGE);
  const showMore = useCallback(
    () => setShown((count) => count + SESSIONS_PAGE),
    []
  );

  const entries = (items ?? []).filter(
    (item) => item.id !== excludeId && hasLoggedSet(item)
  );
  if (entries.length === 0) {
    return null;
  }

  return (
    <Card className="gap-sm" variant="ghost">
      <CardTitle>Progress</CardTitle>
      {entries.slice(0, shown).map((entry) => (
        <SessionTable entry={entry} key={entry.id} weightLabel={weightLabel} />
      ))}
      {shown < entries.length ? (
        <Button
          contentColorClassName="text-primary"
          fill
          icon="chevron.down"
          iconPosition="trailing"
          label="Load more"
          onPress={showMore}
          variant="ghost"
        />
      ) : null}
    </Card>
  );
}
