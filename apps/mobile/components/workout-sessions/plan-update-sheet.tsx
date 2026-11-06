import { rateLimitedFor } from "@fitme/api-client";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";

import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { H3, Muted } from "~/components/ui/typography";
import {
  closePlanUpdatePrompt,
  usePlanUpdatePrompt,
} from "~/hooks/plan-update-prompt";
import type { PlanUpdatePrompt } from "~/hooks/plan-update-prompt";
import { shownExercise, useExercises } from "~/hooks/queries/library";
import { useApplyPlanUpdateMutation } from "~/hooks/queries/workout-sessions";
import { useI18n } from "~/lib/i18n";
import {
  formatPlanChange,
  planUpdateProperties,
  planUpdateSlugs,
} from "~/lib/plan-changes";
import type {
  PlanUpdate,
  PlanUpdateChange,
  PlanUpdateChangeKind,
} from "~/lib/plan-changes";
import { segmentClient } from "~/lib/segment";

/**
 * Every query that reads a Plan's Workouts, refetched once changes apply: the
 * Plan lists, and each Plan in full, which the Workout screen reads too.
 */
const PLAN_QUERY_KEYS = [["plans"], ["plan"]];

const CHANGE_SYMBOL: Record<PlanUpdateChangeKind, SFSymbol> = {
  add_exercise: "plus.circle",
  add_sets: "plus.circle",
  remove_exercise: "minus.circle",
  replace_exercise: "arrow.left.arrow.right.circle",
};

// Changes have no API id; object identity distinguishes identical entries.
const changeKeys = new WeakMap<PlanUpdateChange, number>();
let nextChangeKey = 0;

const getChangeKey = (change: PlanUpdateChange) => {
  const existing = changeKeys.get(change);

  if (existing !== undefined) {
    return existing;
  }

  const key = nextChangeKey;
  nextChangeKey += 1;
  changeKeys.set(change, key);

  return key;
};

interface PlanUpdateSheetProps {
  /** The apply failed: shows the error and turns Update plan into Retry. */
  hasFailed: boolean;
  isApplying: boolean;
  onKeep: () => void;
  onUpdate: () => void;
  open: boolean;
  preview: PlanUpdate | null;
  /** The apply was rate limited: the seconds to wait before Retry can work. */
  waitSeconds: number | null;
}

/**
 * "Update your plan?": lists exactly what a finished Workout Session would
 * save to its Workout, one line per change, each Exercise by its Exercise
 * Library name (a slug the library can't resolve shows the slug's name) and
 * weights in the preview's `weight_unit`. The host applies the changes and
 * moves on. It can't be swiped away: the User picks
 * Update plan or Keep plan as is.
 */
export const PlanUpdateSheet = ({
  hasFailed,
  isApplying,
  onKeep,
  onUpdate,
  open,
  preview,
  waitSeconds,
}: PlanUpdateSheetProps) => {
  const i18n = useI18n();
  const { t } = useTranslation();
  const exercises = useExercises(planUpdateSlugs(preview?.changes ?? []));

  const updateLabel = hasFailed
    ? t("planUpdate.retry")
    : t("planUpdate.update");

  const nameOf = (slug: string) =>
    (exercises[slug] ?? shownExercise(slug, null)).name;

  const handleIsPresentedChange = useCallback(
    (isPresented: boolean) => {
      // Dismissal is disabled; should the system close it anyway, the Plan
      // stays as it is.
      if (!isPresented && open && !isApplying) {
        onKeep();
      }
    },
    [isApplying, onKeep, open]
  );

  return (
    <Dialog
      dismissDisabled
      isPresented={open}
      onIsPresentedChange={handleIsPresentedChange}
    >
      {preview ? (
        <>
          <View className="flex flex-col items-stretch justify-center gap-2">
            <H3>{t("planUpdate.title")}</H3>
            <Muted>
              {t("planUpdate.description", {
                plan: preview.plan?.name ?? "",
                workout: preview.workout?.name ?? "",
              })}
            </Muted>
          </View>
          <View
            className="flex flex-col items-stretch justify-center gap-3"
            testID="plan-update-changes"
          >
            {preview.changes.map((change) => {
              const line = formatPlanChange(
                change,
                preview.weight_unit,
                nameOf,
                i18n
              );

              return (
                <View
                  accessibilityLabel={line.accessibilityLabel}
                  accessible
                  className="flex-row items-start gap-2"
                  key={getChangeKey(change)}
                >
                  <SymbolImage
                    className="text-body text-primary"
                    name={CHANGE_SYMBOL[change.kind]}
                  />
                  <Text className="flex-1">{line.text}</Text>
                </View>
              );
            })}
          </View>
          {hasFailed ? (
            <ErrorMessage>
              {waitSeconds === null
                ? t("planUpdate.failed")
                : t("planUpdate.rateLimited", { seconds: waitSeconds })}
            </ErrorMessage>
          ) : null}
          <View className="flex flex-col items-stretch justify-center gap-3">
            <Button
              accessibilityHint={t("planUpdate.updateHint")}
              accessibilityLabel={updateLabel}
              isLoading={isApplying}
              label={updateLabel}
              onPress={onUpdate}
              testID="plan-update-accept"
            />
            <Button
              accessibilityHint={t("planUpdate.keepHint")}
              accessibilityLabel={t("planUpdate.keep")}
              disabled={isApplying}
              label={t("planUpdate.keep")}
              onPress={onKeep}
              testID="plan-update-decline"
              variant="secondary"
            />
          </View>
        </>
      ) : null}
    </Dialog>
  );
};

/**
 * Shows the "Update your plan?" question `useFinishWorkoutSession` asks after
 * a finish (see `showPlanUpdatePrompt`). Mounted once, in the root layout.
 * Update plan applies the changes, refetches the Plan and opens the Summary;
 * a failed apply stays in the sheet with Retry. Keep plan as is opens the
 * Summary and applies nothing.
 */
export const PlanUpdateSheetHost = () => {
  const prompt = usePlanUpdatePrompt();
  const queryClient = useQueryClient();

  const {
    error: applyError,
    isError: hasFailed,
    isPending: isApplying,
    mutate: apply,
    reset,
  } = useApplyPlanUpdateMutation();

  // A ref, so a second tap before the re-render is still ignored.
  const answeredRef = useRef(false);
  // The last question, kept so the content stays while the sheet slides away.
  const [lastPrompt, setLastPrompt] = useState<PlanUpdatePrompt | null>(prompt);

  if (prompt && prompt !== lastPrompt) {
    setLastPrompt(prompt);
  }

  useEffect(() => {
    answeredRef.current = prompt === null;
    reset();
  }, [prompt, reset]);

  const close = useCallback((answered: PlanUpdatePrompt) => {
    closePlanUpdatePrompt(answered.sessionId);
    answered.onDone();
  }, []);

  const handleUpdate = useCallback(() => {
    if (!prompt || answeredRef.current) {
      return;
    }

    answeredRef.current = true;
    apply(
      { sessionId: prompt.sessionId },
      {
        onError: (error) => {
          // Too many requests is the User's to wait out, not a bug.
          if (rateLimitedFor(error) === null) {
            Sentry.captureException(error);
          }

          answeredRef.current = false;
        },
        onSuccess: () => {
          for (const queryKey of PLAN_QUERY_KEYS) {
            queryClient.invalidateQueries({ queryKey });
          }

          segmentClient.track(
            "Plan Update Accepted",
            planUpdateProperties(prompt.sessionId, prompt.preview)
          );
          close(prompt);
        },
      }
    );
  }, [apply, close, prompt, queryClient]);

  const handleKeep = useCallback(() => {
    if (!prompt || answeredRef.current) {
      return;
    }

    answeredRef.current = true;
    segmentClient.track(
      "Plan Update Declined",
      planUpdateProperties(prompt.sessionId, prompt.preview)
    );
    close(prompt);
  }, [close, prompt]);

  const shown = prompt ?? lastPrompt;

  return (
    <PlanUpdateSheet
      hasFailed={hasFailed}
      isApplying={isApplying}
      onKeep={handleKeep}
      onUpdate={handleUpdate}
      open={!!prompt}
      preview={shown?.preview ?? null}
      waitSeconds={applyError ? rateLimitedFor(applyError) : null}
    />
  );
};
