import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";

import ExerciseVideo from "~/components/exercises/exercise-video";
import { InstructionSteps } from "~/components/exercises/instruction-steps";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Muted } from "~/components/ui/typography";
import { useExercise, useExerciseDetailQuery } from "~/hooks/queries/library";

const ExerciseGuideScreen = () => {
  const { t } = useTranslation();
  const { exerciseSlug } = useLocalSearchParams<{ exerciseSlug: string }>();

  const {
    data: exercise,
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
      return (
        <>
          {exercise.video_url ? (
            <View className="border-continuous w-full overflow-hidden rounded-2xl">
              <ExerciseVideo url={exercise.video_url} />
            </View>
          ) : null}
          {exercise.description ? <Muted>{exercise.description}</Muted> : null}
          <InstructionSteps instructions={exercise.instructions} />
        </>
      );
    }

    if (exercise === null) {
      return (
        <Text className="mt-lg text-center" variant="muted">
          {t("exercise.gone")}
        </Text>
      );
    }

    if (isError) {
      return (
        <View className="gap-sm pt-lg items-center">
          <Text className="text-center" variant="muted">
            {t("exercise.loadError")}
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

    return (
      <View className="pt-lg items-center">
        <ActivityIndicator colorClassName="accent-foreground" />
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
        contentContainerClassName="gap-sm p-md"
        contentInsetAdjustmentBehavior="automatic"
      >
        {renderContent()}
      </ScrollView>
    </>
  );
};

export default ExerciseGuideScreen;
