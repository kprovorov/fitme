import { type MuscleGroup, muscleGroups } from "@fitme/core";
import type { ExerciseSummary } from "@fitme/library-sdk";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExerciseRowSymbol } from "~/components/exercises/exercise-row";
import ExercisesView from "~/components/views/exercises-view";
import { useHeaderSearch } from "~/hooks/header-search";
import {
  newMuscleChoiceKey,
  useMuscleChoiceOpening,
} from "~/hooks/muscle-choice";
import { updatePlanDraft } from "~/hooks/plan-draft";
import { addDraftExercise, replaceDraftExercise } from "~/lib/plan-draft";

const isMuscleGroup = (value: string | undefined): value is MuscleGroup =>
  (muscleGroups as readonly string[]).includes(value ?? "");

/**
 * The Plan builder's Library picker, pushed over the Workout editor: it
 * writes the picked Exercise's slug straight into the draft and comes back,
 * so nothing is saved until the Plan editor's Save. Given
 * `replaceExerciseKey` it swaps that Exercise in place, keeping its sets;
 * otherwise it appends one with its starting sets.
 *
 * It isn't the Workout Session's picker (which writes through the API), but
 * the two share `ExercisesView`: the same header search bar, Muscles pill
 * and sheet, paging and rate-limit behaviour.
 */
export default function PlanExercisePickerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { onSearchChange, search, searchBarOptions } = useHeaderSearch({
    inSheet: true,
  });
  const {
    draft: draftKey,
    muscleGroup,
    replaceExerciseKey,
    workoutKey,
  } = useLocalSearchParams<{
    draft: string;
    muscleGroup?: string;
    replaceExerciseKey?: string;
    workoutKey: string;
  }>();

  // Each opening starts over, and is forgotten once closed.
  const [muscleChoiceKey] = useState(newMuscleChoiceKey);
  useMuscleChoiceOpening(
    muscleChoiceKey,
    isMuscleGroup(muscleGroup) ? [muscleGroup] : []
  );

  // Closing pops this route: never twice (a second tap while it slides
  // away), which would pop the Workout editor too.
  const left = useRef<boolean>(false);

  const onExercisePress = useCallback(
    ({ slug }: ExerciseSummary) => {
      if (left.current) {
        return;
      }
      left.current = true;
      updatePlanDraft(draftKey, (draft) =>
        replaceExerciseKey
          ? replaceDraftExercise(draft, workoutKey, replaceExerciseKey, slug)
          : addDraftExercise(draft, workoutKey, slug)
      );
      router.back();
    },
    [draftKey, replaceExerciseKey, router, workoutKey]
  );

  const close = useCallback(() => {
    if (left.current) {
      return;
    }
    left.current = true;
    router.back();
  }, [router]);

  // The whole row picks the Exercise; VoiceOver names what tapping it does.
  const rowAccessibilityLabel = useCallback(
    ({ name }: ExerciseSummary) =>
      replaceExerciseKey
        ? t("planEditor.picker.replaceWith", { name })
        : t("planEditor.picker.addExercise", { name }),
    [replaceExerciseKey, t]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: searchBarOptions,
          headerShown: true,
          title: replaceExerciseKey
            ? t("planEditor.picker.replaceTitle")
            : t("planEditor.picker.addTitle"),
          unstable_headerRightItems: () => [
            {
              accessibilityLabel: t("planEditor.picker.close"),
              icon: { name: "xmark", type: "sfSymbol" },
              label: t("planEditor.picker.close"),
              onPress: close,
              type: "button",
            },
          ],
        }}
      />
      {/* The list is the screen's scroll container: no ScrollView around it. */}
      <ExercisesView
        contentContainerClassName="px-md"
        muscleChoiceKey={muscleChoiceKey}
        onExercisePress={onExercisePress}
        onSearchChange={onSearchChange}
        rowAccessibilityLabel={rowAccessibilityLabel}
        search={search}
        trailing={
          <ExerciseRowSymbol
            name={replaceExerciseKey ? "arrow.left.arrow.right" : "plus"}
          />
        }
      />
    </>
  );
}
