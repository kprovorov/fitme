import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useI18n } from "~/lib/i18n";

interface FinishWorkoutSuggestionDialogProps {
  /**
   * Whether the caller's finish mutation is pending, e.g. its `isPending`.
   * While it's `true` the dialog shows Finish as busy and can't be dismissed.
   * When it drops back to `false` with the dialog still open, the finish is
   * taken to have failed and Finish becomes tappable again.
   */
  isFinishing: boolean;
  /**
   * Called once when the user taps Finish Workout; repeated taps are ignored
   * until `isFinishing` settles back to `false` or the dialog is opened
   * again, or `onFinish` throws or rejects. The caller owns the mutation,
   * navigation, error handling and closing the dialog; an async `onFinish`
   * must report its own errors, as a rejection only unlocks the dialog.
   */
  onFinish: () => void;
  /**
   * Called once when the user keeps training: the Keep Training button, the
   * close button, or dismissing the sheet by swiping it down or tapping
   * outside it. The caller is expected to set `open` to `false`.
   */
  onKeepTraining: () => void;
  open: boolean;
}

/**
 * Suggests finishing the workout once every planned set has been tracked.
 * Purely presentational: it never touches the session or navigates — the
 * caller decides what Finish and Keep Training do.
 */
const FinishWorkoutSuggestionDialog = ({
  open,
  onFinish,
  onKeepTraining,
  isFinishing,
}: FinishWorkoutSuggestionDialogProps) => {
  // The App language's instance, started wherever the dialog renders.
  const i18n = useI18n();
  // A ref, not state, so a second tap landing before the re-render is still
  // seen as a duplicate.
  const choiceMadeRef = useRef<boolean>(false);
  const [isFinishPending, setIsFinishPending] = useState(false);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;

    // Every presentation starts fresh.
    if (open) {
      choiceMadeRef.current = false;
      setIsFinishPending(false);
    }
  }, [open]);

  const wasFinishingRef = useRef(isFinishing);

  useEffect(() => {
    const finishSettled = wasFinishingRef.current && !isFinishing;
    wasFinishingRef.current = isFinishing;

    if (finishSettled && openRef.current) {
      choiceMadeRef.current = false;
      setIsFinishPending(false);
    }
  }, [isFinishing]);

  const handleFinish = useCallback(() => {
    if (choiceMadeRef.current) {
      return;
    }
    choiceMadeRef.current = true;
    // Bridges the gap until the caller's `isFinishing` turns `true`.
    setIsFinishPending(true);

    // Without unlocking on failure the dialog would stay busy and
    // undismissable.
    const unlock = () => {
      choiceMadeRef.current = false;
      setIsFinishPending(false);
    };

    let result: unknown;
    try {
      result = onFinish();
    } catch (error) {
      unlock();
      throw error;
    }

    // `() => void` also accepts an async callback, whose rejection the
    // try/catch can't see.
    if (result instanceof Promise) {
      result.catch(unlock);
    }
  }, [onFinish]);

  const handleKeepTraining = useCallback(() => {
    if (choiceMadeRef.current) {
      return;
    }
    choiceMadeRef.current = true;
    onKeepTraining();
  }, [onKeepTraining]);

  const handleIsPresentedChange = useCallback(
    (isPresented: boolean) => {
      // The sheet also reports the caller closing it; only a dismissal of an
      // open, undecided dialog counts as Keep Training.
      if (!isPresented && openRef.current) {
        handleKeepTraining();
      }
    },
    [handleKeepTraining]
  );

  const finishBusy = isFinishPending || isFinishing;

  return (
    <Dialog
      dismissDisabled={finishBusy}
      isPresented={open}
      onIsPresentedChange={handleIsPresentedChange}
    >
      <HStack className="justify-end">
        <Button
          accessibilityHint={i18n.t(
            "finishWorkout.suggestion.keepTrainingHint"
          )}
          accessibilityLabel={i18n.t("finishWorkout.suggestion.close")}
          disabled={finishBusy}
          icon="xmark"
          onPress={handleKeepTraining}
          shape="circle"
          size="lg"
          testID="finish-workout-suggestion-close"
          variant="ghost"
        />
      </HStack>
      <VStack className="items-stretch gap-2">
        <H3 className="text-center">
          {i18n.t("finishWorkout.suggestion.title")}
        </H3>
        <Text className="text-center text-muted-foreground">
          {i18n.t("finishWorkout.suggestion.description")}
        </Text>
      </VStack>
      <VStack className="items-stretch gap-3">
        <Button
          accessibilityHint={i18n.t("finishWorkout.suggestion.finishHint")}
          accessibilityLabel={i18n.t("finishWorkout.suggestion.finish")}
          isLoading={finishBusy}
          label={i18n.t("finishWorkout.suggestion.finish")}
          onPress={handleFinish}
          testID="finish-workout-suggestion-finish"
        />
        <Button
          accessibilityHint={i18n.t(
            "finishWorkout.suggestion.keepTrainingHint"
          )}
          accessibilityLabel={i18n.t("finishWorkout.suggestion.keepTraining")}
          disabled={finishBusy}
          label={i18n.t("finishWorkout.suggestion.keepTraining")}
          onPress={handleKeepTraining}
          testID="finish-workout-suggestion-keep-training"
          variant="secondary"
        />
      </VStack>
    </Dialog>
  );
};

FinishWorkoutSuggestionDialog.displayName = "FinishWorkoutSuggestionDialog";

export type { FinishWorkoutSuggestionDialogProps };
export { FinishWorkoutSuggestionDialog };
