import type { MuscleGroup } from "@fitme/core";
import type { ExerciseSummary } from "@fitme/library-sdk";
import { useRouter } from "expo-router";
import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  View,
} from "react-native";
import {
  ExerciseRow,
  ExerciseRowSeparator,
} from "~/components/exercises/exercise-row";
import { MuscleGroupChips } from "~/components/exercises/muscle-group-chips";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import {
  getMuscleChoice,
  setMuscleChoice,
  useMuscleChoice,
} from "~/hooks/muscle-choice";
import { useExerciseSearch } from "~/hooks/queries/library";
import { i18n } from "~/lib/i18n";

/** How close to the end, in visible lengths, the next page starts loading. */
const END_REACHED_THRESHOLD = 0.5;

const exerciseKey = (exercise: ExerciseSummary) => exercise.slug;

/**
 * The Library, searched and filtered by Muscle group: the Library tab and the
 * Exercise picker. It is the screen's scroll container, a virtualised list
 * loading the next page as the User nears its end. The Muscles pill opens the
 * Muscles sheet over the screen, which hands the confirmed choice back under
 * `muscleChoiceKey` (`hooks/muscle-choice.ts`), the screen's own. Each chosen
 * group shows as a chip under the pill; its × removes that group at once.
 */
const ExercisesView = ({
  onExercisePress = () => {
    /* noop */
  },
  rowAccessibilityLabel,
  trailing,
  muscleChoiceKey,
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
  // The Muscles pill can't open the sheet (the picker, while saving).
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
  const router = useRouter();
  const muscleGroups = useMuscleChoice(muscleChoiceKey);
  const [refreshing, setRefreshing] = useState(false);

  const {
    exercises,
    hasMore,
    isError,
    isLoadMoreError,
    isLoadingMore,
    loadMore,
    refetch,
  } = useExerciseSearch({ muscleGroups, search });

  // A failed search or refresh shows the error state, with no rows: the
  // shortened list reaching its end must not page past it.
  const canLoadMore = hasMore && !isLoadingMore && !isError;

  const loadNextPage = useCallback(() => {
    // A request in flight is never sent again.
    loadMore({ cancelRefetch: false });
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
    refetch().then(() => setRefreshing(false));
  }, [refetch]);

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

  const showAll = useCallback(() => {
    onSearchChange("");
    setMuscleChoice(muscleChoiceKey, []);
  }, [muscleChoiceKey, onSearchChange]);

  const openMuscles = useCallback(() => {
    router.push({
      params: { choice: muscleChoiceKey },
      pathname: "/muscles",
    });
  }, [muscleChoiceKey, router]);

  const removeMuscleGroup = useCallback(
    (group: MuscleGroup) => {
      setMuscleChoice(
        muscleChoiceKey,
        getMuscleChoice(muscleChoiceKey).filter((chosen) => chosen !== group)
      );
    },
    [muscleChoiceKey]
  );

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
        <VStack className="items-center gap-sm pt-lg">
          <H3 className="text-center">{t("library.loadErrorTitle")}</H3>
          <Text className="text-center text-muted-foreground">
            {t("library.loadError")}
          </Text>
          <Button
            fill={false}
            label={t("common.tryAgain")}
            onPress={retry}
            variant="secondary"
          />
        </VStack>
      );
    }
    if (exercises) {
      return (
        <VStack className="items-center gap-sm pt-lg">
          <H3 className="text-center">{t("library.emptyTitle")}</H3>
          <Text className="text-center text-muted-foreground">
            {t("library.empty")}
          </Text>
          <Button fill={false} label={t("library.showAll")} onPress={showAll} />
        </VStack>
      );
    }
    return (
      <View className="items-center pt-lg">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  };

  const renderFooter = () => {
    if (isLoadingMore) {
      return (
        <View className="items-center pt-md" testID="exercises-loading-more">
          <ActivityIndicator colorClassName="accent-foreground" />
        </View>
      );
    }
    if (isLoadMoreError) {
      return (
        <ErrorMessage className="pt-md text-center">
          {t("library.loadMoreError")}
        </ErrorMessage>
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
        <VStack className="items-stretch pb-md">
          <Button
            className="self-start"
            disabled={musclesDisabled}
            fill={false}
            icon="chevron.down"
            iconPosition="trailing"
            label={t("library.muscles")}
            onPress={openMuscles}
            size="sm"
            variant="secondary"
          />
          <MuscleGroupChips
            groups={muscleGroups}
            onRemove={removeMuscleGroup}
          />
        </VStack>
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
