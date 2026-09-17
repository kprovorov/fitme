import type { Exercise } from "@fitme/core";
import { router, Stack } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView } from "react-native";
import ExercisesView, {
  type ExercisesViewHandle,
} from "~/components/views/exercises-view";

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
          headerBackButtonDisplayMode: "minimal",
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: "Library",
        }}
      />
      <ScrollView
        className="px-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
        showsVerticalScrollIndicator={false}
      >
        <ExercisesView
          onExercisePress={onExercisePress}
          ref={exercisesViewRef}
        />
      </ScrollView>
    </>
  );
}
