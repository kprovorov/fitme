import { ApiError, rateLimitedFor } from "@fitme/api-client";
import {
  Stack,
  useLocalSearchParams,
  useNavigation,
  usePreventRemove,
  useRouter,
} from "expo-router";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import PlanEditorView from "~/components/plans/plan-editor-view";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSavePlanMutation } from "~/hooks/mutations/plans";
import {
  getPlanDraft,
  rebasePlanDraft,
  startPlanDraft,
  updatePlanDraft,
  usePlanDraft,
  usePlanDraftOpening,
} from "~/hooks/plan-draft";
import { usePlanQuery } from "~/hooks/queries/plans";
import {
  addDraftWorkout,
  adoptSavedIds,
  canAddDraftWorkout,
  isSavablePlanDraft,
  nextWorkoutName,
  planDraftChanged,
  planDraftFrom,
  planUnitsChanged,
  savePlanBody,
} from "~/lib/plan-draft";
import type { PlanDraft } from "~/lib/plan-draft";

/**
 * What a failed save shows, in the App language: a Plan that's gone says so
 * (as every other Plan write does), a 429 the wait, and anything else the
 * generic error — never the API's own message.
 */
const saveFailureMessage = (t: TFunction, error: ApiError | null) => {
  const code = error?.code ?? null;

  if (code === "not_found") {
    return t("plans.errors.notFound");
  }

  const seconds = rateLimitedFor(error);

  if (seconds !== null) {
    return t("planEditor.errors.saveRateLimited", { seconds });
  }

  if (code === "unknown_exercises") {
    return t("planEditor.errors.unknownExercises");
  }

  if (code === "library_unavailable") {
    return t("planEditor.errors.libraryUnavailable");
  }

  return t("planEditor.errors.saveFailed");
};

/**
 * The Plan editor: it opens on a draft of the Plan in full, ids included
 * (ADR 0016), and Save sends the whole draft back through
 * `PUT /v1/plans/{id}`, including every field it doesn't show (the note, the
 * Workouts' descriptions, their Exercises and sets) as it was loaded.
 *
 * Its Workouts open the Workout editor, pushed over it inside the same
 * modal and working on the same draft; given a `workoutId`, it opens that
 * Workout's editor at once ("Edit Workout" on the Workout screen).
 *
 * Save and Cancel are the native header's items; Save is disabled while the
 * draft can't be saved. Leaving with unsaved changes — Cancel or a swipe —
 * asks first, and the draft is thrown away with the Screen. A failed save
 * keeps it, with what went wrong above the form, and a save the User typed
 * over while it was in flight keeps the editor open on what they typed.
 */
// oxlint-disable-next-line react-doctor/no-giant-component -- This component owns the complete plan-draft save and cancellation lifecycle.
const PlanEditorScreen = () => {
  const { planId, workoutId } = useLocalSearchParams<{
    planId: string;
    /** A Workout to open at once: "Edit Workout" on the Workout screen. */
    workoutId?: string;
  }>();

  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();

  // One draft per opening, thrown away with the Screen.
  const draftKey = useId();
  usePlanDraftOpening(draftKey);

  const {
    data: plan,
    error: readError,
    isError,
    refetch,
  } = usePlanQuery({ variables: { id: planId } });

  // Seeded once (`startPlanDraft` keeps the first), so a refreshed read
  // never overwrites what the User has typed.
  useEffect(() => {
    if (plan) {
      startPlanDraft(draftKey, planDraftFrom(plan));
    }
  }, [draftKey, plan]);

  const entry = usePlanDraft(draftKey);

  const change = useCallback(
    (update: (draft: PlanDraft) => PlanDraft) =>
      updatePlanDraft(draftKey, update),
    [draftKey]
  );

  const openWorkout = useCallback(
    (workoutKey: string) => {
      router.push({
        params: { draft: draftKey, planId, workoutKey },
        pathname: "/plans/[planId]/edit/workouts/[workoutKey]",
      });
    },
    [draftKey, planId, router]
  );

  const addWorkout = useCallback(() => {
    const current = getPlanDraft(draftKey)?.draft;

    if (!(current && canAddDraftWorkout(current))) {
      return;
    }

    const added = addDraftWorkout(
      current,
      nextWorkoutName(current.workouts, (letter) =>
        t("planEditor.newWorkoutName", { letter })
      )
    );

    updatePlanDraft(draftKey, () => added.draft);
    openWorkout(added.key);
  }, [draftKey, openWorkout, t]);

  // "Edit Workout" opens the editor at that Workout: once, whether the Plan
  // still has it or not, so going back doesn't push it again.
  const openedWorkout = useRef<boolean>(false);
  useEffect(() => {
    if (openedWorkout.current || !(entry && workoutId)) {
      return;
    }

    openedWorkout.current = true;
    const workout = entry.draft.workouts.find(({ id }) => id === workoutId);

    if (workout) {
      openWorkout(workout.key);
    }
  }, [entry, openWorkout, workoutId]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const { isPending: isSaving, mutate: savePlan } = useSavePlanMutation();

  const hasChanges = entry
    ? planDraftChanged(entry.loaded, entry.draft)
    : false;

  // Set before leaving, so the unsaved-changes guard lets the Screen go.
  const [isLeaving, setIsLeaving] = useState(false);

  const disablePrevention = usePreventRemove(
    hasChanges && !isLeaving,
    ({ repeat }) => {
      Alert.alert(
        t("planEditor.discard.title"),
        t("planEditor.discard.message"),
        [
          { style: "cancel", text: t("common.cancel") },
          {
            onPress: () => {
              setIsLeaving(true);
              repeat();
            },
            style: "destructive",
            text: t("planEditor.discard.confirm"),
          },
        ]
      );
    }
  );

  const close = useCallback(() => {
    setIsLeaving(true);
    disablePrevention();

    if (router.canGoBack()) {
      router.back();
    } else {
      router.dismissTo(`/plans/${planId}`);
    }
  }, [disablePrevention, planId, router]);

  const cancel = useCallback(() => {
    if (!hasChanges) {
      close();

      return;
    }

    Alert.alert(
      t("planEditor.discard.title"),
      t("planEditor.discard.message"),
      [
        { style: "cancel", text: t("common.cancel") },
        {
          onPress: close,
          style: "destructive",
          text: t("planEditor.discard.confirm"),
        },
      ]
    );
  }, [close, hasChanges, t]);

  const draft = entry?.draft;

  // The User's measurement system was switched somewhere else while the
  // editor was open, so the API converted every stored weight and the
  // draft's targets are in the unit before it. Saving them would write
  // 60 kg as 60 lbs, so Save is off until the editor is reopened.
  const staleUnits =
    draft !== undefined && plan && planUnitsChanged(draft, plan);

  const isSavable =
    draft !== undefined && !staleUnits && isSavablePlanDraft(draft);

  const save = useCallback(() => {
    if (!(draft && !staleUnits && isSavablePlanDraft(draft))) {
      return;
    }

    setSaveError(null);
    // The draft as it was sent. Only Save is disabled while the call is in
    // flight, so the User can keep editing; what they typed meanwhile is
    // theirs to keep, and the editor stays open with it.
    const sent = draft;
    savePlan(
      { body: savePlanBody(sent), id: planId },
      {
        onError: (error) => {
          setSaveError(
            saveFailureMessage(t, error instanceof ApiError ? error : null)
          );
        },
        onSuccess: (saved) => {
          const current = getPlanDraft(draftKey)?.draft;
          // Closing while the Workout editor or the picker sits over this
          // Screen would take the modal out from under the User, so the
          // editor stays open and they close it themselves.
          const movedOn = current && planDraftChanged(sent, current);

          if (movedOn || !navigation.isFocused()) {
            // The rows this save created now have ids: the draft takes them
            // on, so saving again updates those rows instead of replacing
            // them. What's saved is `sent` with the same ids, so only the
            // edits made since are unsaved and leaving asks about those.
            updatePlanDraft(draftKey, (held) =>
              adoptSavedIds(held, sent, saved)
            );
            rebasePlanDraft(draftKey, adoptSavedIds(sent, sent, saved));

            return;
          }

          close();
        },
      }
    );
  }, [close, draft, draftKey, navigation, planId, savePlan, staleUnits, t]);

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const headerItems = () => [
    {
      disabled: !isSavable || isSaving,
      label: t("planEditor.save"),
      onPress: save,
      type: "button" as const,
      variant: "prominent" as const,
    },
  ];

  const cancelItems = () => [
    {
      label: t("common.cancel"),
      onPress: cancel,
      type: "button" as const,
    },
  ];

  const screen = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: t("planEditor.title"),
        unstable_headerLeftItems: cancelItems,
        unstable_headerRightItems: draft ? headerItems : undefined,
      }}
    />
  );

  if (draft) {
    return (
      <>
        {screen}
        <KeyboardAwareScrollView
          bottomOffset={24}
          className="flex-1"
          contentContainerClassName="gap-md p-md pb-lg"
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          testID="plan-editor"
        >
          <PlanEditorView
            draft={draft}
            onAddWorkout={addWorkout}
            onChange={change}
            onOpenWorkout={openWorkout}
            saveError={
              staleUnits ? t("planEditor.errors.unitsChanged") : saveError
            }
          />
        </KeyboardAwareScrollView>
      </>
    );
  }

  const message = () => {
    if (plan === null) {
      return t("plans.errors.notFound");
    }

    const seconds = rateLimitedFor(readError);

    return seconds === null
      ? t("plans.loadError")
      : t("common.rateLimited", { seconds });
  };

  return (
    <>
      {screen}
      <ScrollView
        className="p-md flex-1"
        contentInsetAdjustmentBehavior="automatic"
      >
        {plan === null || isError ? (
          <View className="gap-sm pt-lg items-center">
            <Text className="text-center" variant="muted">
              {message()}
            </Text>
            <Button
              fill={false}
              label={plan === null ? t("plans.goBack") : t("common.tryAgain")}
              onPress={plan === null ? close : retry}
              size="lg"
              variant="secondary"
            />
          </View>
        ) : (
          <View className="pt-lg items-center" testID="plan-editor-loading">
            <ActivityIndicator colorClassName="accent-foreground" />
          </View>
        )}
      </ScrollView>
    </>
  );
};

export default PlanEditorScreen;
