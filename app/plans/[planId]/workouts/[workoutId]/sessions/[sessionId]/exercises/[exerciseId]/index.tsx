import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import ExerciseVideo from "~/components/exercises/exercise-video";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { H4, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import ExerciseHistoryView from "~/components/views/exercise-history-view";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import { useWorkoutSessionExerciseQuery } from "~/hooks/queries/workout-session-exercises";
import { Info } from "~/lib/icons/Info";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";

export default function WorkoutSessionExerciseScreen() {
  const { planId, workoutId, sessionId, exerciseId } = useLocalSearchParams();

  const { data: workoutSessionExercise } = useWorkoutSessionExerciseQuery({
    variables: {
      planId: Number(planId),
      workoutId: Number(workoutId),
      sessionId: Number(sessionId),
      exerciseId: Number(exerciseId),
    },
  });

  return workoutSessionExercise ? (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
            color: "#C0FF38",
          },
          title: workoutSessionExercise.exercise.name,
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
          // headerRight: () => (
          //   <Button variant="ghost" size="icon-sm" shape="pill">
          //     <Text>
          //       <Info size={21} className="text-foreground" />
          //     </Text>
          //   </Button>
          // ),
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <KeyboardAwareScrollView
            bottomOffset={62}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <VStack className="items-stretch py-sm flex-1 gap-md px-md">
              {/* <VStack className="gap-0 items-start">
                <H4 className="text-primary">
                  {workoutSessionExercise.exercise.name}
                </H4>
                <P>{workoutSessionExercise.exercise.description}</P>
              </VStack> */}

              {workoutSessionExercise.exercise.video_url && (
                <View className="rounded-lg w-full overflow-hidden">
                  <ExerciseVideo exercise={workoutSessionExercise.exercise} />
                </View>
              )}

              <P>{workoutSessionExercise.exercise.description}</P>

              <WorkoutSessionExerciseSetsTableView
                planId={Number(planId)}
                workoutId={Number(workoutId)}
                sessionId={Number(sessionId)}
                exerciseId={Number(exerciseId)}
                workoutSessionExerciseSets={workoutSessionExercise.sets}
              />

              <ExerciseHistoryView
                exerciseId={workoutSessionExercise.exercise_id}
              />
            </VStack>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  ) : null;
}
