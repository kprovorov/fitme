import { formatCount, formatDate, formatNumber, unitName } from "@fitme/i18n";
import { isThisYear } from "date-fns";
import {
  type ReactNode,
  type Ref,
  useCallback,
  useImperativeHandle,
} from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import {
  type ExerciseHistoryEntry,
  type ExerciseHistorySet,
  useExerciseHistoryQuery,
} from "~/hooks/queries/exercises";
import { useI18n } from "~/lib/i18n";
import { formatSetTarget, formatSetWeight } from "~/lib/set-inputs";
import { cn } from "~/lib/utils";
import {
  SET_CHECK_COLUMN_CLASS,
  SET_NUMBER_COLUMN_CLASS,
  SET_TABLE_MAX_FONT_SCALE,
  SET_TARGET_COLUMN_CLASS,
} from "../forms/workout-exercise-set-form";
import { Card, CardTitle } from "../ui/card";
import { Text } from "../ui/text";
import SessionLoadError from "../workout-sessions/session-load-error";

/** What a screen scrolling near its end asks the card for. */
export interface ExerciseHistoryHandle {
  /** Reads the next page, unless none follows or one is already in flight. */
  loadMore: () => void;
}

interface ExerciseHistoryViewProps {
  /** The session exercise being logged, left out of its own history. */
  excludeId?: string;
  /** The Exercise, by its Exercise slug. */
  exerciseSlug: string;
  ref?: Ref<ExerciseHistoryHandle>;
}

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
  entry: ExerciseHistoryEntry;
  weightLabel: string;
}) {
  const { t } = useTranslation();
  const i18n = useI18n();
  const logged = [...entry.sets].sort((a, b) => a.order - b.order);
  const date = new Date(entry.session.started_at);
  return (
    <View>
      <Text className="text-muted-foreground text-subhead">
        {/* `21 October`, with the year once it's not this one. */}
        {formatDate(i18n, date, isThisYear(date) ? "dayMonth" : "dayMonthYear")}
      </Text>
      <View className="gap-sm">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Row>
            <Cell className={SET_NUMBER_COLUMN_CLASS} header>
              #
            </Cell>
            <Cell className={SET_TARGET_COLUMN_CLASS} header>
              {t("sets.columns.target")}
            </Cell>
            <Cell className="flex-1" header>
              {t("sets.columns.reps")}
            </Cell>
            <Cell className="flex-1" header>
              {weightLabel}
            </Cell>
          </Row>
        </View>
        {logged.map((set: ExerciseHistorySet) => {
          const target = formatSetTarget(set, weightLabel);
          // Bodyweight sets log no weight.
          const weight =
            set.weight_completed === null
              ? null
              : formatSetWeight(set.weight_completed);
          const loggedText = [
            formatCount(i18n, "reps", set.reps_completed),
            // Spoken in the App language's decimals: "50.5" / "50,5".
            set.weight_completed === null
              ? null
              : `${formatNumber(i18n, set.weight_completed)} ${weightLabel}`,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <Row
              accessibilityLabel={[
                t("exerciseHistory.set", {
                  logged: loggedText,
                  order: set.order,
                }),
                // A set added during the session had no target.
                target === "–" ? null : t("exerciseHistory.target", { target }),
              ]
                .filter(Boolean)
                .join(". ")}
              key={set.id}
            >
              <Cell className={SET_NUMBER_COLUMN_CLASS}>{`#${set.order}`}</Cell>
              <Cell className={SET_TARGET_COLUMN_CLASS}>{target}</Cell>
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
 * Progress: the Exercise's past Workout Sessions read through `GET
 * /v1/workout-session-exercises`, newest first, each a table of its logged
 * sets, in the answer's `weight_unit`. A page is read at a time, the next one
 * once the screen scrolls near its end (`loadMore` through the card's `ref`).
 * A failed refresh keeps the pages already read; with none read it shows its
 * load error, a 429 the wait, and Try again reads it again.
 */
export default function ExerciseHistoryView({
  exerciseSlug,
  excludeId,
  ref,
}: ExerciseHistoryViewProps) {
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    refetch,
  } = useExerciseHistoryQuery({ variables: { exerciseSlug } });
  const { t } = useTranslation();
  const i18n = useI18n();

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      // A request in flight is never sent again.
      fetchNextPage({ cancelRefetch: false });
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useImperativeHandle(ref, () => ({ loadMore }), [loadMore]);

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const pages = data?.pages ?? [];
  // Every page answers the same unit; the first read is the one on screen.
  const weightLabel = unitName(i18n, pages[0]?.weight_unit ?? "kg");
  const entries = pages
    .flatMap((page) => page.data)
    .filter((entry) => entry.id !== excludeId);

  if (pages.length === 0) {
    // Nothing read: the load error, or nothing at all while it's in flight.
    return isError ? (
      <Card className="gap-sm" variant="ghost">
        <CardTitle>{t("exerciseHistory.title")}</CardTitle>
        <SessionLoadError
          error={error}
          message={t("exerciseHistory.loadError")}
          onRetry={retry}
        />
      </Card>
    ) : null;
  }
  if (entries.length === 0) {
    return null;
  }

  return (
    <Card className="gap-sm" variant="ghost">
      <CardTitle>{t("exerciseHistory.title")}</CardTitle>
      {entries.map((entry) => (
        <SessionTable entry={entry} key={entry.id} weightLabel={weightLabel} />
      ))}
      {isFetchingNextPage ? (
        <ActivityIndicator colorClassName="accent-foreground" />
      ) : null}
    </Card>
  );
}
