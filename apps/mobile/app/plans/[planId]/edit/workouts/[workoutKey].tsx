import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import WorkoutEditorView from "~/components/plans/workout-editor-view";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { updatePlanDraft, usePlanDraft } from "~/hooks/plan-draft";
import { draftWorkoutByKey, type PlanDraft } from "~/lib/plan-draft";

/**
 * The Workout editor, pushed over the Plan editor inside the same modal and
 * working on the same draft (`draft`, the opening's key, which the Plan
 * editor owns): the Workout's name, its Exercises and their sets. It has no
 * Save of its own — the Plan editor's one Save writes the whole draft.
 *
 * Add and Replace open the builder's own Library picker, which writes the
 * picked Exercise's slug into the draft and comes back here.
 */
export default function WorkoutEditorScreen() {
  const {
    draft: draftKey,
    planId,
    workoutKey,
  } = useLocalSearchParams<{
    draft: string;
    planId: string;
    workoutKey: string;
  }>();
  const router = useRouter();
  const { t } = useTranslation();

  const entry = usePlanDraft(draftKey);
  const draft = entry?.draft;
  const workout = draft ? draftWorkoutByKey(draft, workoutKey) : undefined;

  const change = useCallback(
    (update: (current: PlanDraft) => PlanDraft) =>
      updatePlanDraft(draftKey, update),
    [draftKey]
  );

  const openPicker = useCallback(
    (replaceExerciseKey?: string) => {
      router.push({
        params: { draft: draftKey, planId, replaceExerciseKey, workoutKey },
        pathname: "/plans/[planId]/edit/exercise-picker",
      });
    },
    [draftKey, planId, router, workoutKey]
  );
  const addExercise = useCallback(() => openPicker(), [openPicker]);
  const goBack = useCallback(() => router.back(), [router]);

  const screen = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: workout?.name.trim() || t("planEditor.workout.title"),
      }}
    />
  );

  // The draft is gone (the modal closed) or the Workout was removed from the
  // Plan editor underneath: nothing left to edit.
  if (!(draft && workout)) {
    return (
      <>
        {screen}
        <ScrollView
          className="flex-1 p-md"
          contentInsetAdjustmentBehavior="automatic"
        >
          <View className="items-center gap-sm pt-lg">
            <Text className="text-center text-muted-foreground">
              {t("plannedWorkout.gone")}
            </Text>
            <Button
              fill={false}
              label={t("plannedWorkout.goBack")}
              onPress={goBack}
              size="lg"
              variant="secondary"
            />
          </View>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      {screen}
      <KeyboardAwareScrollView
        bottomOffset={24}
        className="flex-1"
        contentContainerClassName="gap-md p-md pb-lg"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        testID="workout-editor"
      >
        <WorkoutEditorView
          onAddExercise={addExercise}
          onChange={change}
          onReplaceExercise={openPicker}
          weightUnit={draft.weightUnit}
          workout={workout}
        />
      </KeyboardAwareScrollView>
    </>
  );
}
