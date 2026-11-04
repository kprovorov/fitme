import { ApiError, rateLimitedFor } from "@fitme/api-client";
import {
  Stack,
  useLocalSearchParams,
  usePreventRemove,
  useRouter,
} from "expo-router";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import PlanEditorView from "~/components/plans/plan-editor-view";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useSavePlanMutation } from "~/hooks/mutations/plans";
import {
  newPlanDraftKey,
  startPlanDraft,
  updatePlanDraft,
  usePlanDraft,
  usePlanDraftOpening,
} from "~/hooks/plan-draft";
import { usePlanQuery } from "~/hooks/queries/plans";
import {
  isSavablePlanDraft,
  type PlanDraft,
  planDraftChanged,
  planDraftFrom,
  savePlanBody,
} from "~/lib/plan-draft";

/**
 * What a failed save shows, in the App language: a Plan that's gone says so
 * (as every other Plan write does), a 429 the wait, and anything else the
 * generic error — never the API's own message.
 */
const saveFailureMessage = (t: TFunction, error: unknown) => {
  if (error instanceof ApiError && error.code === "not_found") {
    return t("plans.errors.notFound");
  }
  const seconds = rateLimitedFor(error);
  return seconds === null
    ? t("planEditor.errors.saveFailed")
    : t("planEditor.errors.saveRateLimited", { seconds });
};

/**
 * The Plan editor: it opens on a draft of the Plan in full, ids included
 * (ADR 0016), and Save sends the whole draft back through
 * `PUT /v1/plans/{id}`, including every field it doesn't show (the note, the
 * Workouts' descriptions, their Exercises and sets) as it was loaded.
 *
 * Save and Cancel are the native header's items; Save is disabled while the
 * draft can't be saved. Leaving with unsaved changes — Cancel or a swipe —
 * asks first, and the draft is thrown away with the Screen. A failed save
 * keeps it, with what went wrong above the form.
 */
export default function PlanEditorScreen() {
  const { planId: planIdParam } = useLocalSearchParams();
  const planId = planIdParam as string;
  const router = useRouter();
  const { t } = useTranslation();

  // One draft per opening, thrown away with the Screen.
  const [draftKey] = useState(newPlanDraftKey);
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
              disablePrevention();
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
  const isSavable = draft !== undefined && isSavablePlanDraft(draft);

  const save = useCallback(() => {
    if (!(draft && isSavablePlanDraft(draft))) {
      return;
    }
    setSaveError(null);
    savePlan(
      { body: savePlanBody(draft), id: planId },
      {
        onError: (error) => {
          setSaveError(saveFailureMessage(t, error));
        },
        onSuccess: close,
      }
    );
  }, [close, draft, planId, savePlan, t]);

  const retry = useCallback(() => {
    refetch();
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
            onChange={change}
            saveError={saveError}
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
        className="flex-1 p-md"
        contentInsetAdjustmentBehavior="automatic"
      >
        {plan === null || isError ? (
          <View className="items-center gap-sm pt-lg">
            <Text className="text-center text-muted-foreground">
              {message()}
            </Text>
            <Button
              fill={false}
              label={plan === null ? t("plans.goBack") : t("common.tryAgain")}
              onPress={plan === null ? close : retry}
              variant="secondary"
            />
          </View>
        ) : (
          <View className="items-center pt-lg" testID="plan-editor-loading">
            <ActivityIndicator colorClassName="accent-foreground" />
          </View>
        )}
      </ScrollView>
    </>
  );
}
