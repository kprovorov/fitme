import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import ExerciseVideo from "~/components/exercises/exercise-video";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import {
  useExercise,
  useExerciseDetailQuery,
} from "~/hooks/queries/exercise-library";

export default function ExerciseScreen() {
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
          <P className="text-primary">{exercise.description}</P>
          <Muted>{exercise.instructions}</Muted>
        </VStack>
      );
    }
    if (exercise === null) {
      return (
        <Text className="pt-lg text-center text-muted-foreground">
          This exercise isn't in the library any more.
        </Text>
      );
    }
    if (isError) {
      return (
        <View className="items-center gap-sm pt-lg">
          <Text className="text-center text-muted-foreground">
            Couldn't load this exercise. Check your connection and try again.
          </Text>
          <Button
            fill={false}
            label="Try Again"
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
}
