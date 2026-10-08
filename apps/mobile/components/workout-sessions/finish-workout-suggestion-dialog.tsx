import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { HStack } from "~/components/ui/hstack";
import { Text } from "~/components/ui/text";
import { H3 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";

interface FinishWorkoutSuggestionDialogProps {
  /**
   * Shows the Finish button as busy while the caller's finish mutation is
   * pending. When it drops back to `false` with the dialog still open, the
   * finish is taken to have failed and Finish becomes tappable again.
   */
  isFinishing?: boolean;
  /**
   * Called once when the user taps Finish Workout. Repeated taps are ignored
   * until the dialog is opened again, the returned promise rejects, or
   * `isFinishing` settles back to `false` — the latter two allow a retry.
   * The caller owns the mutation, navigation, error reporting and closing
   * the dialog.
   */
  onFinish: () => unknown;
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
  isFinishing = false,
}: FinishWorkoutSuggestionDialogProps) => {
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
    setIsFinishPending(true);

    const result = onFinish();

    if (result instanceof Promise) {
      result.catch(() => {
        // Errors are the caller's to surface; here they only unlock a retry.
        choiceMadeRef.current = false;
        setIsFinishPending(false);
      });
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
    <Dialog isPresented={open} onIsPresentedChange={handleIsPresentedChange}>
      <HStack className="justify-end">
        <Button
          accessibilityHint="Closes this suggestion and keeps the workout going"
          accessibilityLabel="Close"
          disabled={finishBusy}
          onPress={handleKeepTraining}
          shape="pill"
          size="icon-sm"
          systemImage="xmark"
          testID="finish-workout-suggestion-close"
          variant="ghost"
        />
      </HStack>
      <VStack className="items-stretch gap-2">
        <H3 className="text-center">Workout completed!</H3>
        <Text className="text-center text-muted-foreground">
          You've tracked all your planned sets.
        </Text>
      </VStack>
      <VStack className="items-stretch gap-3">
        <Button
          accessibilityHint="Finishes this workout session"
          accessibilityLabel="Finish Workout"
          isLoading={finishBusy}
          label="Finish Workout"
          onPress={handleFinish}
          shape="pill"
          testID="finish-workout-suggestion-finish"
        />
        <Button
          accessibilityHint="Closes this suggestion and keeps the workout going"
          accessibilityLabel="Keep Training"
          disabled={finishBusy}
          label="Keep Training"
          onPress={handleKeepTraining}
          shape="pill"
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
