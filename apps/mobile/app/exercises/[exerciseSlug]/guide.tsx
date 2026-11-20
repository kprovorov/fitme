import { rateLimitedFor } from "@fitme/api-client";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { ExerciseUnavailable } from "~/components/exercises/exercise-unavailable";
import { InstructionSteps } from "~/components/exercises/instruction-steps";
import { TextListCard } from "~/components/exercises/text-list-card";
import { useExercise, useExerciseDetailQuery } from "~/hooks/queries/library";

/**
 * An Exercise's guide, a form sheet over its detail screen or a Workout
 * Session Exercise: the numbered steps, then the common mistakes (Figma's
 * Exercise Guide frames, FIT-737).
 */
const ExerciseGuideScreen = () => {
  const { t } = useTranslation();
  const { exerciseSlug } = useLocalSearchParams<{ exerciseSlug: string }>();

  const {
    data: exercise,
    error,
    isError,
    refetch,
  } = useExerciseDetailQuery(exerciseSlug);

  // The name rows already show, while the Exercise in full loads.
  const { name } = useExercise(exerciseSlug);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const renderContent = () => {
    if (exercise) {
      if (
        exercise.steps.length === 0 &&
        exercise.common_mistakes.length === 0
      ) {
        return (
          <ExerciseUnavailable
            message={t("exercise.guideEmpty")}
            symbol="list.number"
            title={t("exercise.guideEmptyTitle")}
          />
        );
      }

      return (
        <View className="gap-md px-sm pt-xs pb-md">
          <InstructionSteps steps={exercise.steps} />
          <TextListCard
            gap="sm"
            items={exercise.common_mistakes}
            testID="exercise-common-mistakes"
            title={t("exercise.commonMistakes")}
          />
        </View>
      );
    }

    // The guide has no frame of its own for a missing Exercise: the detail
    // screen's words, with no action, since the sheet is swiped away.
    if (exercise === null) {
      return (
        <ExerciseUnavailable
          message={t("exercise.gone")}
          symbol="magnifyingglass"
          title={t("exercise.notFoundTitle")}
        />
      );
    }

    if (isError) {
      const waitSeconds = rateLimitedFor(error);

      return (
        <ExerciseUnavailable
          action={{ label: t("common.tryAgain"), onPress: retry }}
          message={
            waitSeconds === null
              ? t("exercise.checkConnection")
              : t("common.rateLimited", { seconds: waitSeconds })
          }
          symbol="exclamationmark.triangle"
          title={t("exercise.loadErrorTitle")}
        />
      );
    }

    return (
      <View className="pt-lg items-center">
        <ActivityIndicator
          accessibilityLabel={t("exercise.spoken.loading")}
          colorClassName="accent-foreground"
        />
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: exercise?.name ?? name,
        }}
      />
      <ScrollView
        contentContainerClassName="grow"
        contentInsetAdjustmentBehavior="automatic"
      >
        {renderContent()}
      </ScrollView>
    </>
  );
};

export default ExerciseGuideScreen;
