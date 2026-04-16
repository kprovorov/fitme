import { router, Stack } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import ExercisesView, {
  type ExercisesViewHandle,
} from "~/components/views/exercises-view";
import type { Exercise } from "~/lib/models";

export default function LibraryScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const exercisesViewRef = useRef<ExercisesViewHandle | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await exercisesViewRef.current?.refresh();

    setRefreshing(false);
  }, []);

  const onExercisePress = useCallback((exercise: Exercise) => {
    router.push(`/exercises/${exercise.id}`);
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Library",
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <ScrollView
        className="px-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
      >
        <ExercisesView
          onExercisePress={onExercisePress}
          ref={exercisesViewRef}
        />
      </ScrollView>
    </>
  );
}
