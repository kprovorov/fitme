import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { H3, Muted } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import {
  closePlanUpdatePrompt,
  type PlanUpdatePrompt,
  usePlanUpdatePrompt,
} from "~/hooks/plan-update-prompt";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { workoutSessionPlanChanges } from "~/hooks/queries/workout-sessions";
import {
  formatPlanChange,
  type PlanChangeKind,
  type PlanChanges,
} from "~/lib/plan-changes";
import { segmentClient } from "~/lib/segment";

/** Every query that reads a Plan's Workouts, refetched once changes apply. */
const PLAN_QUERY_KEYS = [
  ["plans"],
  ["plan"],
  ["workout"],
  ["workout-exercise"],
];

const CHANGE_SYMBOL: Record<PlanChangeKind, SFSymbol> = {
  add_exercise: "plus.circle",
  add_sets: "plus.circle",
  remove_exercise: "minus.circle",
  replace_exercise: "arrow.left.arrow.right.circle",
};

interface PlanUpdateSheetProps {
  /** The apply failed: shows the error and turns Update plan into Retry. */
  hasFailed: boolean;
  isApplying: boolean;
  measurementSystem: MeasurementSystem;
  onKeep: () => void;
  onUpdate: () => void;
  open: boolean;
  preview: PlanChanges | null;
}

/**
 * "Update your plan?": lists exactly what a finished Workout Session would
 * save to its Workout, one line per change. Purely presentational; the host
 * applies the changes and moves on. It can't be swiped away: the User picks
 * Update plan or Keep plan as is.
 */
export function PlanUpdateSheet({
  hasFailed,
  isApplying,
  measurementSystem,
  onKeep,
  onUpdate,
  open,
  preview,
}: PlanUpdateSheetProps) {
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
          <VStack className="items-stretch gap-2">
            <H3>Update your plan?</H3>
            <Muted>
              Save today's changes to {preview.workout?.name} in{" "}
              {preview.plan?.name}.
            </Muted>
          </VStack>
          <VStack className="items-stretch gap-3" testID="plan-update-changes">
            {preview.changes.map((change, index) => {
              const line = formatPlanChange(change, measurementSystem);
              return (
                <View
                  accessibilityLabel={line.accessibilityLabel}
                  accessible
                  className="flex-row items-start gap-2"
                  // Two changes can read the same (the same Exercise twice).
                  // biome-ignore lint/suspicious/noArrayIndexKey: the list never reorders
                  key={`${line.text}-${index}`}
                >
                  <SymbolImage
                    className="text-body text-primary"
                    name={CHANGE_SYMBOL[change.kind]}
                  />
                  <Text className="flex-1 text-body">{line.text}</Text>
                </View>
              );
            })}
          </VStack>
          {hasFailed ? (
            <ErrorMessage>
              Couldn't update your plan. Check your connection and try again.
            </ErrorMessage>
          ) : null}
          <VStack className="items-stretch gap-3">
            <Button
              accessibilityHint="Saves these changes to your plan, then shows the workout summary"
              accessibilityLabel={hasFailed ? "Retry" : "Update plan"}
              isLoading={isApplying}
              label={hasFailed ? "Retry" : "Update plan"}
              onPress={onUpdate}
              testID="plan-update-accept"
            />
            <Button
              accessibilityHint="Leaves your plan unchanged and shows the workout summary"
              accessibilityLabel="Keep plan as is"
              disabled={isApplying}
              label="Keep plan as is"
              onPress={onKeep}
              testID="plan-update-decline"
              variant="secondary"
            />
          </VStack>
        </>
      ) : null}
    </Dialog>
  );
}

const promptProperties = ({ preview, sessionId }: PlanUpdatePrompt) => ({
  plan_id: preview.plan?.id,
  workout_id: preview.workout?.id,
  workout_session_id: sessionId,
});

/**
 * Shows the "Update your plan?" question `useFinishWorkoutSession` asks after
 * a finish (see `showPlanUpdatePrompt`). Mounted once, in the root layout.
 * Update plan applies the changes, refetches the Plan and opens the Summary;
 * a failed apply stays in the sheet with Retry. Keep plan as is opens the
 * Summary and applies nothing.
 */
export function PlanUpdateSheetHost() {
  const prompt = usePlanUpdatePrompt();
  const queryClient = useQueryClient();
  const { data: profile } = useProfileQuery({ enabled: !!prompt });
  const [isApplying, setIsApplying] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  // A ref, so a second tap before the re-render is still ignored.
  const busyRef = useRef(false);
  // Keeps the content while the sheet slides away.
  const [shown, setShown] = useState<PlanUpdatePrompt | null>(prompt);

  useEffect(() => {
    busyRef.current = false;
    setIsApplying(false);
    setHasFailed(false);
    if (prompt) {
      setShown(prompt);
    }
  }, [prompt]);

  const done = useCallback((answered: PlanUpdatePrompt) => {
    closePlanUpdatePrompt(answered.sessionId);
    answered.onDone();
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!prompt || busyRef.current) {
      return;
    }
    busyRef.current = true;
    setIsApplying(true);
    setHasFailed(false);
    try {
      await workoutSessionPlanChanges(prompt.sessionId, { apply: true });
    } catch (error) {
      Sentry.captureException(error);
      busyRef.current = false;
      setIsApplying(false);
      setHasFailed(true);
      return;
    }
    for (const queryKey of PLAN_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey });
    }
    segmentClient.track("Plan Update Accepted", promptProperties(prompt));
    done(prompt);
  }, [done, prompt, queryClient]);

  const handleKeep = useCallback(() => {
    if (!prompt || busyRef.current) {
      return;
    }
    busyRef.current = true;
    segmentClient.track("Plan Update Declined", promptProperties(prompt));
    done(prompt);
  }, [done, prompt]);

  return (
    <PlanUpdateSheet
      hasFailed={hasFailed}
      isApplying={isApplying}
      measurementSystem={profile?.measurement_system ?? "metric"}
      onKeep={handleKeep}
      onUpdate={handleUpdate}
      open={!!prompt}
      preview={(prompt ?? shown)?.preview ?? null}
    />
  );
}
