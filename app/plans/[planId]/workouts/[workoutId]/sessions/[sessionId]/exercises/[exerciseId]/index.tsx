import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import ExerciseVideo from "~/components/exercises/exercise-video";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import ExerciseHistoryView from "~/components/views/exercise-history-view";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import { useWorkoutSessionExerciseQuery } from "~/hooks/queries/workout-session-exercises";
import { useWorkoutSessionQuery } from "~/hooks/queries/workout-sessions";
import { Info } from "~/lib/icons/Info";

export default function WorkoutSessionExerciseScreen() {
  const [isOpen, setIsOpen] = useState(false);

  const {
    planId: _planId,
    workoutId: _workoutId,
    sessionId,
    exerciseId,
  } = useLocalSearchParams();

  const { data: workoutSessionExercise } = useWorkoutSessionExerciseQuery({
    variables: {
      sessionId: sessionId as string,
      exerciseId: exerciseId as string,
    },
  });

  const { data: workoutSession } = useWorkoutSessionQuery({
    variables: { sessionId: sessionId as string },
  });

  const isFinished = !!workoutSession?.finished_at;

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
          headerRight: () => (
            <Button
              onPress={() => setIsOpen(true)}
              shape="pill"
              size="icon-sm"
              variant="ghost"
            >
              <Info className="text-foreground" size={21} />
            </Button>
          ),
        }}
      />

      <KeyboardAwareScrollView
        bottomOffset={62}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <VStack className="flex-1 items-stretch gap-md px-md py-sm">
          <AlertDialog onOpenChange={setIsOpen} open={isOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-primary">
                  How to?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {workoutSessionExercise.exercise.instructions}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Text>OK</Text>
                </AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {workoutSessionExercise.exercise.video_url && (
            <View className="w-full overflow-hidden rounded-lg">
              <ExerciseVideo exercise={workoutSessionExercise.exercise} />
            </View>
          )}

          <P>{workoutSessionExercise.exercise.description}</P>

          <WorkoutSessionExerciseSetsTableView
            exerciseId={exerciseId as string}
            readOnly={isFinished}
            workoutSessionExerciseSets={workoutSessionExercise.sets}
          />

          <ExerciseHistoryView
            exerciseId={workoutSessionExercise.exercise_id}
          />
        </VStack>
      </KeyboardAwareScrollView>
    </>
  ) : null;
}
