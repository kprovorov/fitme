import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import ExerciseVideo from "~/components/exercises/exercise-video";
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
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: exercise?.name ?? "",
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {!!exercise && (
          <VStack className="items-stretch">
            {exercise?.video_url ? (
              <View className="w-full overflow-hidden rounded-lg">
                <ExerciseVideo exercise={exercise} />
              </View>
            ) : null}
            <P className="text-primary">{exercise?.description}</P>
            <Muted>{exercise?.instructions}</Muted>
          </VStack>
        )}
      </ScrollView>
    </>
  );
}
