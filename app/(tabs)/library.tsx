import React, { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ExercisesView, {
  ExercisesViewHandle,
} from "~/components/views/exercises-view";

export default function LibraryScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const exercisesViewRef = useRef<ExercisesViewHandle | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await exercisesViewRef.current?.refresh();

    setRefreshing(false);
  }, [exercisesViewRef]);

  return (
    <SafeAreaView
      edges={["top"]}
      style={{
        paddingBottom: 64,
      }}
      className="flex-1"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        className="p-6"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ paddingBottom: 64 }}>
          <ExercisesView ref={exercisesViewRef} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
