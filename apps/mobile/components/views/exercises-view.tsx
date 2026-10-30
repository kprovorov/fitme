import { type MuscleGroup, muscleGroups } from "@fitme/core";
import type { ExerciseSummary } from "@fitme/library-sdk";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
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
  type ExerciseRowTrailing,
} from "~/components/exercises/exercise-row";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Input } from "~/components/ui/input";
import { Picker } from "~/components/ui/picker";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useExerciseSearch } from "~/hooks/queries/library";
import { type ChoiceLabels, useChoiceLabels } from "~/lib/choices";
import { i18n } from "~/lib/i18n";

type MuscleGroupFilter = MuscleGroup | "all";

/** How close to the end, in visible lengths, the next page starts loading. */
const END_REACHED_THRESHOLD = 0.5;

const muscleGroupOptions = (
  labels: ChoiceLabels,
  allLabel: string
): { label: string; value: MuscleGroupFilter }[] => [
  { label: allLabel, value: "all" },
  ...muscleGroups
    // Temporary we don't have full-body and cardio exercises
    .filter((group) => !["full-body", "cardio"].includes(group))
    .map((group) => ({ label: labels.muscleGroup(group), value: group })),
];

const exerciseKey = (exercise: ExerciseSummary) => exercise.slug;

/**
 * The Library, searched and filtered by muscle group: the Library tab and the
 * Exercise picker. It is the screen's scroll container, a virtualised list
 * loading the next page as the User nears its end.
 */
const ExercisesView = ({
  onExercisePress = () => {
    /* noop */
  },
  trailing,
  initialMuscleGroup = "all",
  header,
  refreshable = false,
  contentContainerClassName,
  search: headerSearch,
  onSearchChange,
}: {
  onExercisePress?: (exercise: ExerciseSummary) => void;
  // What ends each row: the Library's chevron, or the picker's CTA.
  trailing?: ExerciseRowTrailing;
  initialMuscleGroup?: MuscleGroupFilter;
  // Scrolls with the list, above the search field (the picker's Close).
  header?: React.ReactNode;
  // Pull to refresh (the Library tab).
  refreshable?: boolean;
  contentContainerClassName?: string;
  // The search text, when the screen's header search bar holds it (the
  // Library tab): the in-list field then doesn't show. "Show All Exercises"
  // hands back "" to clear it.
  search?: string;
  onSearchChange?: (search: string) => void;
}) => {
  const { t } = useTranslation(undefined, { i18n });
  const labels = useChoiceLabels();
  const filterOptions = useMemo(
    () => muscleGroupOptions(labels, t("library.allMuscleGroups")),
    [labels, t]
  );
  const [ownSearch, setOwnSearch] = useState("");
  const inHeader = headerSearch !== undefined;
  const search = inHeader ? headerSearch : ownSearch;
  const [muscleGroup, setMuscleGroup] =
    useState<MuscleGroupFilter>(initialMuscleGroup);
  const [refreshing, setRefreshing] = useState(false);

  const {
    exercises,
    hasMore,
    isError,
    isLoadMoreError,
    isLoadingMore,
    loadMore,
    refetch,
  } = useExerciseSearch({
    muscleGroup: muscleGroup === "all" ? undefined : muscleGroup,
    search,
  });

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
    setOwnSearch("");
    onSearchChange?.("");
    setMuscleGroup("all");
  }, [onSearchChange]);

  const shown = isError ? [] : (exercises ?? []);
  const lastIndex = shown.length - 1;

  const renderItem = useCallback(
    ({ item, index }: { item: ExerciseSummary; index: number }) => (
      <ExerciseRow
        exercise={item}
        isFirst={index === 0}
        isLast={index === lastIndex}
        onExercisePress={onExercisePress}
        trailing={trailing}
      />
    ),
    [lastIndex, onExercisePress, trailing]
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
          {header}
          {inHeader ? null : (
            <Input
              accessibilityLabel={t("library.search")}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setOwnSearch}
              placeholder={t("library.search")}
              returnKeyType="search"
              value={search}
            />
          )}
          <Picker
            label={t("library.muscleGroup")}
            onValueChange={setMuscleGroup}
            options={filterOptions}
            value={muscleGroup}
            variant="menu"
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
