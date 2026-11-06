import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";

import ExerciseVideo from "~/components/exercises/exercise-video";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useExercise, useExerciseDetailQuery } from "~/hooks/queries/library";

const ExerciseScreen = () => {
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
    refetch();
  }, [refetch]);

  const renderContent = () => {
    if (exercise) {
      return (
        <VStack className="items-stretch">
          {exercise.video_url ? (
            <View className="w-full overflow-hidden rounded-lg">
              <ExerciseVideo url={exercise.video_url} />
            </View>
          ) : null}
          <P>{exercise.description}</P>
          <Muted>{exercise.instructions}</Muted>
        </VStack>
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
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: exercise?.name ?? name,
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
    </>
  );
};

export default ExerciseScreen;
