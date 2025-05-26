import React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ScrollView, View } from "react-native";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { useExerciseQuery } from "~/hooks/queries/exercises";
import { VStack } from "~/components/ui/vstack";
import { Muted, P } from "~/components/ui/typography";
import ExerciseVideo from "~/components/exercises/exercise-video";

export default function ExerciseScreen() {
  const { exerciseId } = useLocalSearchParams();

  const { data: exercise } = useExerciseQuery({
    variables: {
      exerciseId: Number(exerciseId),
    },
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: exercise?.name ?? "",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView
            className="flex-1 p-6"
            showsVerticalScrollIndicator={false}
          >
            {!!exercise && (
              <VStack className="items-stretch">
                {exercise?.video_url && (
                  <View className="w-full rounded-lg overflow-hidden">
                    <ExerciseVideo exercise={exercise} />
                  </View>
                )}
                <P className="text-primary">{exercise?.description}</P>
                <Muted>{exercise?.instructions}</Muted>
              </VStack>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
