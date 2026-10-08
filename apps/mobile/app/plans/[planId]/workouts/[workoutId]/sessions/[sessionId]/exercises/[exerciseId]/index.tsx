import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import ExerciseVideo from "~/components/exercises/exercise-video";
import { P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import ExerciseHistoryView from "~/components/views/exercise-history-view";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import { WorkoutSessionFinishSuggestion } from "~/components/workout-sessions/workout-session-finish-suggestion";
import { useWorkoutSessionExerciseQuery } from "~/hooks/queries/workout-session-exercises";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";

export default function WorkoutSessionExerciseScreen() {
  const router = useRouter();

  const {
    planId: _planId,
    workoutId: _workoutId,
    sessionId,
    exerciseId,
  } = useLocalSearchParams();

  const { data: workoutSessionExercise } = useWorkoutSessionExerciseQuery({
    variables: {
      exerciseId: exerciseId as string,
      sessionId: sessionId as string,
    },
  });

  const { data: workoutSession } = useWorkoutSessionQuery({
    variables: { sessionId: sessionId as string },
  });

  const isFinished = !!workoutSession?.finished_at;

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            color: "#C0FF38",
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: workoutSessionExercise?.exercise?.name ?? "",
          unstable_headerRightItems: () => {
            if (!workoutSessionExercise?.exercise?.instructions) {
              return [];
            }
            return [
              {
                icon: { name: "info.circle", type: "sfSymbol" },
                label: "Exercise Info",
                onPress: () =>
                  router.push(
                    `/exercises/${workoutSessionExercise.exercise_id}/guide`
                  ),
                type: "button",
              },
            ];
          },
        }}
      />
      {workoutSessionExercise ? (
        <KeyboardAwareScrollView
          bottomOffset={62}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <VStack className="flex-1 items-stretch gap-md px-md py-sm">
            {workoutSessionExercise.exercise.video_url ? (
              <View className="w-full overflow-hidden rounded-lg">
                <ExerciseVideo exercise={workoutSessionExercise.exercise} />
              </View>
            ) : null}

            <P>{workoutSessionExercise.exercise.description}</P>

            <WorkoutSessionExerciseSetsTableView
              exerciseId={exerciseId as string}
              readOnly={isFinished}
              sessionId={sessionId as string}
              workoutSessionExerciseSets={workoutSessionExercise.sets}
            />

            <ExerciseHistoryView
              exerciseId={workoutSessionExercise.exercise_id}
            />
          </VStack>
        </KeyboardAwareScrollView>
      ) : null}
      <WorkoutSessionFinishSuggestion
        isFinished={isFinished}
        screensAboveSession={1}
        sessionId={sessionId as string}
      />
    </>
  );
}
