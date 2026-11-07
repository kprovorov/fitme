import { rateLimitedFor } from "@fitme/api-client";
import { formatCount, formatDate, formatNumber, unitName } from "@fitme/i18n";
import { isThisYear } from "date-fns";
import { useCallback, useImperativeHandle } from "react";
import type { ReactNode, Ref } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";

import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import type {
  ExerciseHistoryEntry,
  ExerciseHistorySet,
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

/** How the screen's scroll asked for the next page. */
export type ExerciseHistoryTrigger =
  /** Scrolling near the end: every 16 ms while the User moves. */
  | "scroll"
  /** A drag ending near the end: one deliberate gesture. */
  | "drag-end";

/** What a screen scrolling near its end asks the card for. */
export interface ExerciseHistoryHandle {
  /**
   * Reads the next page, unless none follows or one is already in flight.
   * Once a page has failed only a `drag-end` asks again, and a 429 not
   * before its wait has passed.
   */
  loadMore: (trigger: ExerciseHistoryTrigger) => void;
}

/** `Retry-After` is in seconds; the query records when its error landed. */
const MS_PER_SECOND = 1000;

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
const Cell = ({
  children,
  className,
  header = false,
}: {
  children: ReactNode;
  className: string;
  header?: boolean;
}) => (
  <View className={className}>
    <Text
      adjustsFontSizeToFit
      className={cn(
        "text-center",
        header ? "text-mono-body-semibold text-primary" : "text-mono-body"
      )}
      maxFontSizeMultiplier={SET_TABLE_MAX_FONT_SCALE}
      numberOfLines={1}
    >
      {children}
    </Text>
  </View>
);

const Row = ({
  accessibilityLabel,
  children,
}: {
  /** What VoiceOver reads for the row, as one element. */
  accessibilityLabel?: string;
  children: ReactNode;
}) => (
  <View
    accessibilityLabel={accessibilityLabel}
    accessible={!!accessibilityLabel}
    className="gap-sm h-10 flex-row items-center"
  >
    {children}
    <View className={SET_CHECK_COLUMN_CLASS} />
  </View>
);

/** One past session: its date, then its logged sets as a table. */
const SessionTable = ({
  entry,
  weightLabel,
}: {
  entry: ExerciseHistoryEntry;
  weightLabel: string;
}) => {
  const { t } = useTranslation();
  const i18n = useI18n();
  const logged = entry.sets.toSorted((a, b) => a.order - b.order);
  const date = new Date(entry.session.started_at);

  return (
    <View>
      <Text variant="muted">
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
};

/**
 * Progress: the Exercise's past Workout Sessions read through `GET
 * /v1/workout-session-exercises`, newest first, each a table of its logged
 * sets in its own page's `weight_unit` (a conversion between two page reads
 * leaves the pages in different units). A page is read at a time, the next
 * one once the screen scrolls near its end (`loadMore` through the card's
 * `ref`). A failed refresh keeps the pages already read; with none read it
 * shows its load error, a 429 the wait, and Try again reads it again.
 */
const ExerciseHistoryView = ({
  exerciseSlug,
  excludeId,
  ref,
}: ExerciseHistoryViewProps) => {
  const {
    data,
    error,
    errorUpdatedAt,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    refetch,
  } = useExerciseHistoryQuery({ variables: { exerciseSlug } });

  const { t } = useTranslation();
  const i18n = useI18n();

  const pages = data?.pages ?? [];
  // A page failed with some read already shown: the entries stay, and asking
  // again on each scroll event (one every 16 ms) would hammer the API right
  // through a 429's wait, which `retry: false` doesn't hold back either.
  const loadMoreFailed = isError && pages.length > 0;
  const waitSeconds = loadMoreFailed ? rateLimitedFor(error) : null;

  const loadMore = useCallback(
    (trigger: ExerciseHistoryTrigger) => {
      if (!hasNextPage || isFetchingNextPage) {
        // A request in flight is never sent again.
        return;
      }

      if (loadMoreFailed) {
        // Only the User's own gesture asks again, and a rate-limited one not
        // before `Retry-After` has passed.
        const waited =
          waitSeconds === null ||
          Date.now() >= errorUpdatedAt + waitSeconds * MS_PER_SECOND;

        if (trigger !== "drag-end" || !waited) {
          return;
        }
      }

      void fetchNextPage({ cancelRefetch: false });
    },
    [
      errorUpdatedAt,
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      loadMoreFailed,
      waitSeconds,
    ]
  );

  useImperativeHandle(ref, () => ({ loadMore }), [loadMore]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Each entry keeps its own page's unit: a measurement system switched
  // elsewhere (Arnold, MCP, another device) between two page reads converts
  // every stored weight, so a later page comes back in the other unit.
  const entries = pages.flatMap((page) => {
    const pageEntries = [];

    for (const entry of page.data) {
      if (entry.id !== excludeId) {
        pageEntries.push({ entry, weightUnit: page.weight_unit });
      }
    }

    return pageEntries;
  });

  if (pages.length === 0) {
    // Nothing read: the load error, or nothing at all while it's in flight.
    return isError ? (
      <Card variant="ghost">
        <View className="gap-sm">
          <CardTitle>{t("exerciseHistory.title")}</CardTitle>
          <SessionLoadError
            error={error}
            message={t("exerciseHistory.loadError")}
            onRetry={retry}
          />
        </View>
      </Card>
    ) : null;
  }

  if (entries.length === 0) {
    return null;
  }

  return (
    <Card variant="ghost">
      <View className="gap-sm">
        <CardTitle>{t("exerciseHistory.title")}</CardTitle>
        {entries.map(({ entry, weightUnit }) => (
          <SessionTable
            entry={entry}
            key={entry.id}
            weightLabel={unitName(i18n, weightUnit)}
          />
        ))}
        {isFetchingNextPage ? (
          <ActivityIndicator colorClassName="accent-foreground" />
        ) : null}
      </View>
    </Card>
  );
};

export default ExerciseHistoryView;
