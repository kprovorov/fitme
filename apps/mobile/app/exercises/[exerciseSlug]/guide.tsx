import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, View } from "react-native";
import ExerciseVideo from "~/components/exercises/exercise-video";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { H4, Muted } from "~/components/ui/typography";
import { useExercise, useExerciseDetailQuery } from "~/hooks/queries/library";

/** A markdown list (`- step` or `1. step` lines) as plain steps. */
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s*/;

function instructionSteps(instructions: string): string[] {
  return instructions
    .split("\n")
    .map((line) => line.replace(LIST_MARKER, "").trim())
    .filter((line) => line.length > 0);
}

export default function ExerciseGuideScreen() {
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
      const steps = exercise.instructions
        ? instructionSteps(exercise.instructions)
        : [];
      return (
        <>
          <H4>{exercise.name}</H4>
          {exercise.video_url ? (
            <View className="w-full overflow-hidden rounded-2xl border-continuous">
              <ExerciseVideo url={exercise.video_url} />
            </View>
          ) : null}
          {exercise.description ? (
            <Muted className="text-body">{exercise.description}</Muted>
          ) : null}
          {steps.map((step, index) => (
            <View className="flex-row gap-3" key={step}>
              <Text className="w-6 text-mono-body-semibold text-primary">
                {index + 1}
              </Text>
              <Text className="flex-1 text-body">{step}</Text>
            </View>
          ))}
        </>
      );
    }
    if (exercise === null) {
      return (
        <Text className="pt-lg text-center text-muted-foreground">
          {t("exercise.gone")}
        </Text>
      );
    }
    if (isError) {
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            {t("exercise.loadError")}
          </Text>
          <Button
            fill={false}
            label={t("common.tryAgain")}
            onPress={retry}
            variant="secondary"
          />
        </View>
      );
    }
    return (
      <View className="items-center pt-lg">
        <ActivityIndicator colorClassName="accent-foreground" />
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
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
}
