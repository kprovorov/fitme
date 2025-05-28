import { Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { H4, P } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import ExerciseVideo from "~/components/exercises/exercise-video";
import WorkoutSessionExerciseSetsTableView from "~/components/views/workout-session-exercise-sets-table-view";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useWorkoutSessionExerciseQuery } from "~/hooks/queries/workout-session-exercises";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { View } from "react-native";
import { useExerciseHistoryQuery } from "~/hooks/queries/exercises";
import { Text } from "~/components/ui/text";
import { HStack } from "~/components/ui/hstack";
import {
  Table,
  TableCell,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { format } from "date-fns";

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

  const { data: exerciseHistory } = useExerciseHistoryQuery({
    variables: {
      exerciseId: workoutSessionExercise?.exercise_id!,
    },
    enabled: !!workoutSessionExercise?.exercise_id,
  });

  return workoutSessionExercise ? (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: workoutSessionExercise.exercise.name,
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView>
          <KeyboardAwareScrollView
            bottomOffset={62}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <VStack className="items-stretch py-sm flex-1">
              <VStack className="items-start px-6">
                <H4 className="text-primary">
                  {workoutSessionExercise.exercise.name}
                </H4>
                <P>{workoutSessionExercise.exercise.description}</P>
              </VStack>

              {workoutSessionExercise.exercise.video_url && (
                <View className="px-6">
                  <View className="rounded-lg w-full overflow-hidden">
                    <ExerciseVideo exercise={workoutSessionExercise.exercise} />
                  </View>
                </View>
              )}

              <VStack className="gap-4 px-6 items-stretch">
                <WorkoutSessionExerciseSetsTableView
                  planId={Number(planId)}
                  workoutId={Number(workoutId)}
                  sessionId={Number(sessionId)}
                  exerciseId={Number(exerciseId)}
                  workoutSessionExerciseSets={workoutSessionExercise.sets}
                />
              </VStack>

              {!!exerciseHistory && exerciseHistory.length > 0 && (
                <VStack className="px-6 items-stretch">
                  <H4>History</H4>
                  {Object.entries(
                    exerciseHistory?.reduce(
                      (acc, set) => {
                        const date = set.logged_at
                          ? new Date(set.logged_at).toDateString()
                          : "";

                        if (!acc[date]) {
                          acc[date] = [];
                        }
                        acc[date].push(set);
                        return acc;
                      },
                      {} as Record<string, typeof exerciseHistory>,
                    ),
                  ).map(([date, sets]) => (
                    <VStack key={date} className="items-stretch gap-0">
                      <HStack className="justify-start px-sm">
                        <Text>{format(new Date(date), "PPP")}</Text>
                      </HStack>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/5">
                              <Text className="text-center">Set</Text>
                            </TableHead>
                            {!!sets[0].weight_recommended && (
                              <TableHead className="w-2/5">
                                <Text className="text-center">kg</Text>
                              </TableHead>
                            )}
                            <TableHead className="w-2/5">
                              <Text className="text-center">Reps</Text>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sets
                            .sort((a, b) => a.order - b.order)
                            .map((set) => (
                              <TableRow key={set.id}>
                                <TableCell className="w-1/5">
                                  <Text className="text-center">
                                    #{set.order}
                                  </Text>
                                </TableCell>
                                {!!set.weight_recommended && (
                                  <TableCell className="w-2/5">
                                    <Text className="text-center">
                                      {set.weight_completed}
                                    </Text>
                                  </TableCell>
                                )}
                                <TableCell className="w-2/5">
                                  <Text className="text-center">
                                    {set.reps_completed}
                                  </Text>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </VStack>
                  ))}
                </VStack>
              )}
            </VStack>
          </KeyboardAwareScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  ) : null;
}
