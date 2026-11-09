import type { ExerciseSummary } from "@fitme/library-sdk";
import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  View,
} from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import { ExerciseFilters } from "~/components/exercises/exercise-filters";
import {
  ExerciseRow,
  ExerciseRowSeparator,
} from "~/components/exercises/exercise-row";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import {
  setEquipmentChoice,
  useEquipmentChoice,
} from "~/hooks/equipment-choice";
import { setMuscleChoice, useMuscleChoice } from "~/hooks/muscle-choice";
import { useExerciseSearch } from "~/hooks/queries/library";
import { i18n } from "~/lib/i18n";

/** How close to the end, in visible lengths, the next page starts loading. */
const END_REACHED_THRESHOLD = 0.5;

const exerciseKey = (exercise: ExerciseSummary) => exercise.slug;

const noop = () => {
  /* noop */
};

/**
 * The key a screen without an Equipment pill reads: never written to, so its
 * choice stays empty.
 */
const NO_EQUIPMENT_KEY = "none";

/**
 * The Library, searched and filtered: the Library tab and the Exercise
 * picker. It is the screen's scroll container, a virtualised list loading the
 * next page as the User nears its end. Its header is `ExerciseFilters`: the
 * Muscles pill over the screen's own Muscle group choice
 * (`muscleChoiceKey`, `hooks/muscle-choice.ts`), the Equipment pill over its
 * Equipment choice when it has one (`equipmentChoiceKey`,
 * `hooks/equipment-choice.ts`; left out, the screen has neither the pill nor
 * a choice), and the chip row of what both have narrowed the list to. The
 * list is the Exercises matching the search, working any chosen Muscle group
 * and needing any chosen Equipment; "Show All Exercises" clears all three.
 */
const ExercisesView = ({
  onExercisePress = noop,
  rowAccessibilityLabel,
  trailing,
  muscleChoiceKey,
  equipmentChoiceKey,
  musclesDisabled = false,
  refreshable = false,
  contentContainerClassName,
  search,
  onSearchChange,
}: {
  onExercisePress?: (exercise: ExerciseSummary) => void;
  // What VoiceOver reads for a row, when its text doesn't say what tapping
  // it does (the picker's "Add Bench Press").
  rowAccessibilityLabel?: (exercise: ExerciseSummary) => string;
  // What ends each row: the Library's chevron, or the picker's "+" or swap.
  trailing?: React.ReactNode;
  // Where the screen's Muscle group choice is kept: one key per screen, so
  // the Library tab and the picker never share a choice.
  muscleChoiceKey: string;
  // Where the screen's Equipment choice is kept, its own key like the Muscle
  // group one. Left out, the screen has no Equipment pill and filters by none.
  equipmentChoiceKey?: string;
  // Neither pill can open its sheet (the picker, while saving).
  musclesDisabled?: boolean;
  // Pull to refresh (the Library tab).
  refreshable?: boolean;
  contentContainerClassName?: string;
  // The search text, held by the screen's native header search bar
  // (`useHeaderSearch`). "Show All Exercises" hands back "" to clear it.
  search: string;
  onSearchChange: (search: string) => void;
}) => {
  const { t } = useTranslation(undefined, { i18n });
  const muscleGroups = useMuscleChoice(muscleChoiceKey);
  // Without a key the choice is a screen's own empty one, read all the same
  // so the hook order never changes.
  const equipment = useEquipmentChoice(equipmentChoiceKey ?? NO_EQUIPMENT_KEY);
  const [refreshing, setRefreshing] = useState(false);

  const {
    exercises,
    hasMore,
    isError,
    isLoadMoreError,
    isLoadingMore,
    loadMore,
    refetch,
  } = useExerciseSearch({ equipment, muscleGroups, search });

  // A failed search or refresh shows the error state, with no rows: the
  // shortened list reaching its end must not page past it.
  const canLoadMore = hasMore && !isLoadingMore && !isError;

  const loadNextPage = useCallback(() => {
    // A request in flight is never sent again.
    void loadMore({ cancelRefetch: false });
  }, [loadMore]);

  const onEndReached = useCallback(() => {
    // After a failed next page only the User's own scroll asks again: the
    // message lengthening the list would otherwise reach its end at once.
    if (canLoadMore && !isLoadMoreError) {
      loadNextPage();
    }
  }, [canLoadMore, isLoadMoreError, loadNextPage]);

  // `onEndReached` fires once per list length, and the failed page's message
  // was that length: a drag ending near the end is what retries.
  const onScrollEndDrag = useCallback(
    ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;

      const fromEnd =
        contentSize.height - contentOffset.y - layoutMeasurement.height;

      if (
        canLoadMore &&
        isLoadMoreError &&
        fromEnd <= END_REACHED_THRESHOLD * layoutMeasurement.height
      ) {
        loadNextPage();
      }
    },
    [canLoadMore, isLoadMoreError, loadNextPage]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);

    // A refetch never rejects: a failure is the query's error state.
    void refetch().then(() => setRefreshing(false));
  }, [refetch]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const showAll = useCallback(() => {
    onSearchChange("");
    setMuscleChoice(muscleChoiceKey, []);

    // A screen without the pill has no Equipment choice to clear, and its
    // stand-in key is never written to.
    if (equipmentChoiceKey !== undefined) {
      setEquipmentChoice(equipmentChoiceKey, []);
    }
  }, [equipmentChoiceKey, muscleChoiceKey, onSearchChange]);

  const shown = isError ? [] : (exercises ?? []);
  const lastIndex = shown.length - 1;

  const renderItem = useCallback(
    ({ item, index }: { item: ExerciseSummary; index: number }) => (
      <ExerciseRow
        accessibilityLabel={rowAccessibilityLabel?.(item)}
        exercise={item}
        isFirst={index === 0}
        isLast={index === lastIndex}
        onExercisePress={onExercisePress}
        trailing={trailing}
      />
    ),
    [lastIndex, onExercisePress, rowAccessibilityLabel, trailing]
  );

  const renderEmpty = () => {
    if (isError) {
      return (
        <View className="gap-sm pt-lg flex flex-col items-center justify-center">
          <H3 className="text-center">{t("library.loadErrorTitle")}</H3>
          <Text className="text-center" variant="muted">
            {t("library.loadError")}
          </Text>
          <Button
            fill={false}
            label={t("common.tryAgain")}
            onPress={retry}
            size="lg"
            variant="secondary"
          />
        </View>
      );
    }

    if (exercises) {
      return (
        <View className="gap-sm pt-lg flex flex-col items-center justify-center">
          <H3 className="text-center">{t("library.emptyTitle")}</H3>
          <Text className="text-center" variant="muted">
            {t("library.empty")}
          </Text>
          <Button
            fill={false}
            label={t("library.showAll")}
            onPress={showAll}
            size="lg"
          />
        </View>
      );
    }

    return (
      <View className="pt-lg items-center">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  };

  const renderFooter = () => {
    if (isLoadingMore) {
      return (
        <View className="pt-md items-center" testID="exercises-loading-more">
          <ActivityIndicator colorClassName="accent-foreground" />
        </View>
      );
    }

    if (isLoadMoreError) {
      return (
        <View className="pt-md">
          <ErrorMessage className="text-center">
            {t("library.loadMoreError")}
          </ErrorMessage>
        </View>
      );
    }

    return null;
  };

  return (
    <FlatList
      contentContainerClassName={contentContainerClassName}
      contentInsetAdjustmentBehavior="automatic"
      data={shown}
      ItemSeparatorComponent={ExerciseRowSeparator}
      // A result is tapped with the search keyboard still up.
      keyboardShouldPersistTaps="handled"
      keyExtractor={exerciseKey}
      ListEmptyComponent={renderEmpty()}
      ListFooterComponent={renderFooter() ?? undefined}
      ListHeaderComponent={
        <ExerciseFilters
          disabled={musclesDisabled}
          equipment={equipment}
          equipmentChoiceKey={equipmentChoiceKey}
          muscleChoiceKey={muscleChoiceKey}
          muscleGroups={muscleGroups}
        />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={END_REACHED_THRESHOLD}
      onScrollEndDrag={onScrollEndDrag}
      refreshControl={
        refreshable ? (
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        ) : undefined
      }
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      testID="exercises-list"
    />
  );
};

ExercisesView.displayName = "ExercisesView";

export default ExercisesView;
