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
import { useCreatePlanMutation, usePlanQuery } from "~/hooks/queries/plans";
import type { FullPlan } from "~/hooks/queries/plans";
import { useProfileQuery } from "~/hooks/queries/profiles";
import type { Profile } from "~/hooks/queries/profiles";
import {
  addDraftWorkout,
  adoptSavedIds,
  canAddDraftWorkout,
  createPlanBody,
  isSavablePlanDraft,
  newPlanDraft,
  NEW_PLAN_ID,
  nextWorkoutName,
  planDraftChanged,
  planDraftFrom,
  planUnitsChanged,
  savePlanBody,
  wholePlanNumber,
} from "~/lib/plan-draft";
import type { PlanDraft } from "~/lib/plan-draft";
import { weightUnitOf } from "~/lib/profile";

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
 * Whether the draft's weights are in another unit than the User's are now:
 * their measurement system was switched somewhere else while the editor was
 * open. For an edit the API converted every stored weight, so the Plan reads
 * back in the other unit; for a Plan being built the Profile does. Saving the
 * draft now would write 60 kg as 60 lbs, so Save is off until it's reopened.
 */
const hasStaleUnits = ({
  draft,
  isCreating,
  plan,
  profile,
}: {
  draft: PlanDraft | undefined;
  isCreating: boolean;
  plan: FullPlan | null | undefined;
  profile: Profile | null | undefined;
}): boolean => {
  if (!draft) {
    return false;
  }

  if (isCreating) {
    return profile !== undefined && draft.weightUnit !== weightUnitOf(profile);
  }

  return Boolean(plan && planUnitsChanged(draft, plan));
};

/**
 * The Plan editor. Editing opens on a draft of the Plan in full, ids included
 * (ADR 0016), and Save sends the whole draft back through
 * `PUT /v1/plans/{id}`, including every field it doesn't show (the note, the
 * Workouts' descriptions, their Exercises and sets) as it was loaded.
 *
 * Opened under `NEW_PLAN_ID` it is building a Plan instead (the create
 * sheet's name and frequency as its params): nothing is read, the draft
 * starts as that many empty lettered Workouts, and Save creates the Plan
 * through `POST /v1/plans`, which makes it the active one, then lands on it.
 * Its goal, place, experience level and Workout duration are optional
 * throughout, and each can be cleared back to unset (ADR 0017).
 *
 * Its Workouts open the Workout editor, pushed over it inside the same
 * modal and working on the same draft; given a `workoutId`, it opens that
 * Workout's editor at once ("Edit Workout" on the Workout screen).
 *
 * Save and Cancel are the native header's items; Save is disabled while the
 * draft can't be saved. Leaving with unsaved changes — Cancel or a swipe —
 * asks first, and the draft is thrown away with the Screen. A failed save
 * keeps it, with what went wrong above the form, and an edit the User typed
 * over while it was in flight keeps the editor open on what they typed.
 */
// oxlint-disable-next-line react-doctor/no-giant-component -- This component owns the complete plan-draft save and cancellation lifecycle.
const PlanEditorScreen = () => {
  const { frequency, name, planId, workoutId } = useLocalSearchParams<{
    /** The create sheet's frequency, for a Plan being built. */
    frequency?: string;
    /** The create sheet's name, for a Plan being built. */
    name?: string;
    planId: string;
    /** A Workout to open at once: "Edit Workout" on the Workout screen. */
    workoutId?: string;
  }>();

  const isCreating = planId === NEW_PLAN_ID;

  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useTranslation();

  // One draft per opening, thrown away with the Screen.
  const draftKey = useId();
  usePlanDraftOpening(draftKey);

  const {
    data: plan,
    error: readError,
    isError: isPlanError,
    refetch: refetchPlan,
  } = usePlanQuery({ enabled: !isCreating, variables: { id: planId } });

  // A Plan being built has no weights read with it, so the unit its set rows
  // label and its targets go out in is the User's own.
  const {
    data: profile,
    error: profileError,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useProfileQuery({ enabled: isCreating });

  // Seeded once (`startPlanDraft` keeps the first), so a refreshed read
  // never overwrites what the User has typed.
  useEffect(() => {
    if (isCreating) {
      // `null` is a User without a Profile, which counts as metric.
      if (profile === undefined) {
        return;
      }

      startPlanDraft(
        draftKey,
        newPlanDraft({
          frequency:
            frequency === undefined ? null : wholePlanNumber(frequency),
          name: name ?? "",
          nameFor: (letter) => t("planEditor.newWorkoutName", { letter }),
          weightUnit: weightUnitOf(profile),
        })
      );

      return;
    }

    if (plan) {
      startPlanDraft(draftKey, planDraftFrom(plan));
    }
  }, [draftKey, frequency, isCreating, name, plan, profile, t]);

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
  const { isPending: isSavingEdit, mutate: savePlan } = useSavePlanMutation();

  const { isPending: isCreatingPlan, mutate: createPlan } =
    useCreatePlanMutation();

  const isSaving = isSavingEdit || isCreatingPlan;

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
      // A Plan being built has no Screen of its own to fall back to.
      router.dismissTo(isCreating ? "/plans" : `/plans/${planId}`);
    }
  }, [disablePrevention, isCreating, planId, router]);

  /** Closes the editor and shows the Plan that was just created. */
  const landOnPlan = useCallback(
    (id: string) => {
      setIsLeaving(true);
      disablePrevention();
      router.dismissTo(`/plans/${id}`);
    },
    [disablePrevention, router]
  );

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

  const staleUnits = hasStaleUnits({ draft, isCreating, plan, profile });

  const isSavable =
    draft !== undefined && !staleUnits && isSavablePlanDraft(draft);

  const onSaveFailed = useCallback(
    (error: unknown) => {
      setSaveError(
        saveFailureMessage(t, error instanceof ApiError ? error : null)
      );
    },
    [t]
  );

  const save = useCallback(() => {
    if (!(draft && !staleUnits && isSavablePlanDraft(draft))) {
      return;
    }

    setSaveError(null);

    if (isCreating) {
      // A create can only be saved once: the editor still knows no Plan id,
      // so a second Save would create a second Plan. It closes on the answer
      // whatever has the focus and lands on the Plan it just made, so an
      // edit typed in the moment between Save and its answer is lost — the
      // edit path's rebase needs a Plan id this Screen hasn't got.
      createPlan(
        { plan: createPlanBody(draft), source: "builder" },
        {
          onError: onSaveFailed,
          onSuccess: (created) => landOnPlan(created.id),
        }
      );

      return;
    }

    // The draft as it was sent. Only Save is disabled while the call is in
    // flight, so the User can keep editing; what they typed meanwhile is
    // theirs to keep, and the editor stays open with it.
    const sent = draft;
    savePlan(
      { body: savePlanBody(sent), id: planId },
      {
        onError: onSaveFailed,
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
  }, [
    close,
    createPlan,
    draft,
    draftKey,
    isCreating,
    landOnPlan,
    navigation,
    onSaveFailed,
    planId,
    savePlan,
    staleUnits,
  ]);

  const retry = useCallback(() => {
    void (isCreating ? refetchProfile() : refetchPlan());
  }, [isCreating, refetchProfile, refetchPlan]);

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
      // A create is on its way and can't be called back: leaving now would
      // make the Plan, and make it active, with nothing on screen to say so.
      disabled: isCreatingPlan,
      label: t("common.cancel"),
      onPress: cancel,
      type: "button" as const,
    },
  ];

  const screen = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: isCreating ? t("planEditor.createTitle") : t("planEditor.title"),
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

  const isGone = !isCreating && plan === null;
  const isReadError = isCreating ? isProfileError : isPlanError;

  const message = () => {
    if (isGone) {
      return t("plans.errors.notFound");
    }

    const seconds = rateLimitedFor(isCreating ? profileError : readError);

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
        {isGone || isReadError ? (
          <View className="gap-sm pt-lg items-center">
            <Text className="text-center" variant="muted">
              {message()}
            </Text>
            <Button
              fill={false}
              label={isGone ? t("plans.goBack") : t("common.tryAgain")}
              onPress={isGone ? close : retry}
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
