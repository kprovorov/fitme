import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";
import { Muted } from "~/components/ui/typography";
import { useExerciseQuery } from "~/hooks/queries/exercises";

export default function ExerciseGuideScreen() {
  const { exerciseId } = useLocalSearchParams();

  const { data: exercise } = useExerciseQuery({
    variables: { exerciseId: exerciseId as string },
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: exercise?.name ?? "",
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Muted>{exercise?.instructions}</Muted>
      </ScrollView>
    </>
  );
}
