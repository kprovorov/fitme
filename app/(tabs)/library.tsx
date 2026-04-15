import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
    <SafeAreaView
      className="flex-1"
      edges={["top"]}
      style={{
        paddingBottom: 64,
      }}
    >
      <ScrollView
        className="p-6"
        refreshControl={
          <RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
        }
      >
        <View style={{ paddingBottom: 64 }}>
          <ExercisesView
            onExercisePress={onExercisePress}
            ref={exercisesViewRef}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
