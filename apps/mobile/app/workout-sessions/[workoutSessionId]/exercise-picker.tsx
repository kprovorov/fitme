import { type MuscleGroup, muscleGroups } from "@fitme/core";
import type { ExerciseSummary } from "@fitme/library-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { ExerciseRowSymbol } from "~/components/exercises/exercise-row";
import ExercisesView from "~/components/views/exercises-view";
import { useHeaderSearch } from "~/hooks/header-search";
import {
  useCreateWorkoutSessionExerciseMutation,
  useReplaceWorkoutSessionExerciseMutation,
} from "~/hooks/queries/workout-session-exercises";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";
import { sessionEditFailureMessage } from "~/lib/session-edit-failure";

const isMuscleGroup = (value: string | undefined): value is MuscleGroup =>
  (muscleGroups as readonly string[]).includes(value ?? "");

/**
 * The Exercise picker, a page sheet over an open Workout Session: adds the
 * picked Exercise, or, given `replaceExerciseId` (a Workout Session Exercise),
 * swaps it in place, starting on `muscleGroup` (the replaced one's first).
 * It searches from the native header search bar, empty on every open.
 * It closes once saved; a failure says so in an alert and keeps it open.
 */
export default function ExercisePickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { onSearchChange, search, searchBarOptions } = useHeaderSearch({
    inSheet: true,
  });
  const {
    muscleGroup,
    replaceExerciseId: replacingId,
    workoutSessionId: sessionId,
  } = useLocalSearchParams<{
    muscleGroup?: string;
    replaceExerciseId?: string;
    workoutSessionId: string;
  }>();

  // A failed edit may still have been saved (a lost answer): read again
  // either way.
  const rereadSession = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["workout-session"],
    });
  }, [queryClient]);

  const { mutateAsync: addExercise } = useCreateWorkoutSessionExerciseMutation({
    onSettled: rereadSession,
  });

  const { mutateAsync: replaceExercise } =
    useReplaceWorkoutSessionExerciseMutation({ onSettled: rereadSession });

  // Closing pops this route: never twice (a save landing after Close or a
  // swipe down, or a second tap's save), which would pop the session too.
  const left = useRef<boolean>(false);
  const saving = useRef<boolean>(false);
  useEffect(
    () => () => {
      left.current = true;
    },
    []
  );
  const close = useCallback(() => {
    if (left.current) {
      return;
    }
    left.current = true;
    router.back();
  }, [router]);

  const save = useCallback(
    async (exercise: ExerciseSummary) => {
      if (replacingId) {
        try {
          await replaceExercise({
            data: { exercise_slug: exercise.slug },
            exerciseId: replacingId,
          });
        } catch (error) {
          // The picker stays open, so the User can try again.
          Alert.alert(
            t("workoutSession.editFailed.replaceTitle"),
            sessionEditFailureMessage(t, error)
          );
          return;
        }
        if (!IS_E2E) {
          segmentClient.track("Exercise Replaced", {
            exercise_slug: exercise.slug,
            session_id: sessionId,
          });
        }
      } else {
        try {
          await addExercise({
            data: { exercise_slug: exercise.slug },
            sessionId,
          });
        } catch (error) {
          // The picker stays open, so the User can try again.
          Alert.alert(
            t("workoutSession.editFailed.addTitle"),
            sessionEditFailureMessage(t, error)
          );
          return;
        }
        if (!IS_E2E) {
          segmentClient.track("Exercise Added", {
            exercise_slug: exercise.slug,
            session_id: sessionId,
          });
        }
      }
      close();
    },
    [addExercise, close, replaceExercise, replacingId, sessionId, t]
  );

  // One save at a time, so a double tap adds the Exercise once, and none
  // once saved: a tap while the sheet slides away must not add another.
  const onExercisePress = useCallback(
    async (exercise: ExerciseSummary) => {
      if (saving.current || left.current) {
        return;
      }
      saving.current = true;
      try {
        await save(exercise);
      } finally {
        saving.current = false;
      }
    },
    [save]
  );

  // The whole row picks the Exercise; VoiceOver names what tapping it does.
  const rowAccessibilityLabel = useCallback(
    ({ name }: ExerciseSummary) =>
      replacingId
        ? t("workoutSession.picker.replaceWith", { name })
        : t("workoutSession.picker.addExercise", { name }),
    [replacingId, t]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: searchBarOptions,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: replacingId
            ? t("workoutSession.picker.replaceTitle")
            : t("workoutSession.picker.addTitle"),
          unstable_headerRightItems: () => [
            {
              accessibilityLabel: t("workoutSession.picker.close"),
              icon: {
                name: "xmark",
                type: "sfSymbol",
              },
              label: t("workoutSession.picker.close"),
              onPress: close,
              type: "button",
            },
          ],
        }}
      />
      {/* The list is the sheet's scroll container: no ScrollView around it. */}
      <ExercisesView
        contentContainerClassName="px-md"
        initialMuscleGroup={isMuscleGroup(muscleGroup) ? muscleGroup : "all"}
        onExercisePress={onExercisePress}
        onSearchChange={onSearchChange}
        rowAccessibilityLabel={rowAccessibilityLabel}
        search={search}
        trailing={
          <ExerciseRowSymbol
            name={replacingId ? "arrow.left.arrow.right" : "plus"}
          />
        }
      />
    </>
  );
}
