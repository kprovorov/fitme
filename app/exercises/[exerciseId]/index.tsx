import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ExerciseVideo from "~/components/exercises/exercise-video";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { Muted, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useExerciseQuery } from "~/hooks/queries/exercises";

export default function ExerciseScreen() {
  const { exerciseId } = useLocalSearchParams();

  const { data: exercise } = useExerciseQuery({
    variables: {
      exerciseId: exerciseId as string,
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

      <SafeAreaView className="flex-1">
        <ScrollView className="flex-1 p-6" showsVerticalScrollIndicator={false}>
          {!!exercise && (
            <VStack className="items-stretch">
              {exercise?.video_url && (
                <View className="w-full overflow-hidden rounded-lg">
                  <ExerciseVideo exercise={exercise} />
                </View>
              )}
              <P className="text-primary">{exercise?.description}</P>
              <Muted>{exercise?.instructions}</Muted>
            </VStack>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
