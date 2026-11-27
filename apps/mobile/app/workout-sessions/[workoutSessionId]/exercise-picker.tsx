import { useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";

import { ExerciseRowSymbol } from "~/components/exercises/exercise-row";
import ExercisesView from "~/components/views/exercises-view";
import { useEndedWorkoutSession } from "~/hooks/ended-workout-session";
import { holdSessionChoiceKeys } from "~/hooks/ending-workout-session";
import {
  newEquipmentChoiceKey,
  useEquipmentChoiceOpening,
} from "~/hooks/equipment-choice";
import { useHeaderSearch } from "~/hooks/header-search";
import {
  isMuscleGroup,
  newMuscleChoiceKey,
  useMuscleChoiceOpening,
} from "~/hooks/muscle-choice";
import {
  useCreateWorkoutSessionExerciseMutation,
  useReplaceWorkoutSessionExerciseMutation,
} from "~/hooks/queries/workout-session-exercises";
import { WORKOUT_SESSION_QUERY_KEY } from "~/hooks/queries/workout-sessions";
import {
  hasRefusingSessionEnded,
  mayMeanSessionEnded,
} from "~/hooks/refused-session-write";
import { analytics } from "~/lib/analytics";
import type { ExerciseSummary } from "~/lib/exercises";
import { sessionEditFailureMessage } from "~/lib/session-edit-failure";

/**
 * The Exercise picker, a page sheet over an open Workout Session: adds the
 * picked Exercise, or, given `replaceExerciseId` (a Workout Session Exercise),
 * swaps it in place, starting on `muscleGroup` (the replaced one's first).
 * It searches from the native header search bar, empty on every open, and
 * narrows the list by Muscle group and Equipment through the same pills and
 * sheets as the Library tab, each choice its own per opening.
 * It closes once saved; a failure says so in an alert and keeps it open.
 * It moves on with its Workout Session when that ends elsewhere.
 */
const ExercisePickerScreen = () => {
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

  // Finished or deleted elsewhere: the session's screens move on, this sheet
  // included, as from the session screen.
  useEndedWorkoutSession(sessionId);

  // Each opening starts over: the replaced Exercise's first Muscle group, or
  // none, and forgotten once closed.
  const muscleChoiceKey = useMemo(() => newMuscleChoiceKey(), []);
  useMuscleChoiceOpening(
    muscleChoiceKey,
    isMuscleGroup(muscleGroup) ? [muscleGroup] : []
  );

  // The Equipment choice starts empty every opening, Replace included: the
  // gear around the User is what they narrow by, not the Exercise they are
  // swapping out. Forgotten once closed, and never the Library tab's.
  const equipmentChoiceKey = useMemo(() => newEquipmentChoiceKey(), []);
  useEquipmentChoiceOpening(equipmentChoiceKey, []);

  // The choice sheets it opens close with the session's screens.
  useEffect(
    () =>
      holdSessionChoiceKeys(sessionId, [muscleChoiceKey, equipmentChoiceKey]),
    [equipmentChoiceKey, muscleChoiceKey, sessionId]
  );

  // A failed edit may still have been saved (a lost answer): read again
  // either way.
  const rereadSession = useCallback(
    (_: unknown, error: Error | null) => {
      // One that may have ended is read again at once by the save itself.
      if (!mayMeanSessionEnded(error)) {
        void queryClient.invalidateQueries({
          queryKey: WORKOUT_SESSION_QUERY_KEY,
        });
      }
    },
    [queryClient]
  );

  const { mutateAsync: addExercise } = useCreateWorkoutSessionExerciseMutation({
    onSettled: rereadSession,
  });

  const { mutateAsync: replaceExercise } =
    useReplaceWorkoutSessionExerciseMutation({ onSettled: rereadSession });

  // Closing pops this route: never twice (a save landing after Close or a
  // swipe down, or a second tap's save), which would pop the session too.
  const left = useRef<boolean>(false);
  const saving = useRef<boolean>(false);
  // While a save is in flight neither choice sheet opens: closing on save
  // pops the top route, which must be the picker.
  const [isSaving, setIsSaving] = useState(false);
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
          // Finished or deleted meanwhile: its screens move on, this one
          // included.
          if (await hasRefusingSessionEnded(queryClient, sessionId, error)) {
            return;
          }

          // The picker stays open, so the User can try again.
          Alert.alert(
            t("workoutSession.editFailed.replaceTitle"),
            sessionEditFailureMessage(t, error)
          );

          return;
        }

        void analytics.send("Exercise Replaced", {
          exercise_slug: exercise.slug,
          session_id: sessionId,
        });
      } else {
        try {
          await addExercise({
            data: { exercise_slug: exercise.slug },
            sessionId,
          });
        } catch (error) {
          // Finished or deleted meanwhile: its screens move on, this one
          // included.
          if (await hasRefusingSessionEnded(queryClient, sessionId, error)) {
            return;
          }

          // The picker stays open, so the User can try again.
          Alert.alert(
            t("workoutSession.editFailed.addTitle"),
            sessionEditFailureMessage(t, error)
          );

          return;
        }

        void analytics.send("Exercise Added", {
          exercise_slug: exercise.slug,
          session_id: sessionId,
        });
      }

      close();
    },
    [
      addExercise,
      close,
      queryClient,
      replaceExercise,
      replacingId,
      sessionId,
      t,
    ]
  );

  // One save at a time, so a double tap adds the Exercise once, and none
  // once saved: a tap while the sheet slides away must not add another.
  const onExercisePress = useCallback(
    async (exercise: ExerciseSummary) => {
      if (saving.current || left.current) {
        return;
      }

      saving.current = true;
      setIsSaving(true);

      try {
        await save(exercise);
      } catch (error) {
        saving.current = false;
        setIsSaving(false);
        throw error;
      }

      saving.current = false;
      setIsSaving(false);
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
            fontFamily: "NunitoSans-Bold",
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
        equipmentChoiceKey={equipmentChoiceKey}
        muscleChoiceKey={muscleChoiceKey}
        musclesDisabled={isSaving}
        onExercisePress={(...args) => {
          void onExercisePress(...args);
        }}
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
};

export default ExercisePickerScreen;
