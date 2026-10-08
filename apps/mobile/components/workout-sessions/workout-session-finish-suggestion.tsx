import { useIsFocused } from "expo-router";
import { useEffect } from "react";
import { useFinishWorkoutSession } from "~/hooks/finish-workout-session";
import { useFinishWorkoutSuggestion } from "~/hooks/finish-workout-suggestion";
import { FinishWorkoutSuggestionDialog } from "./finish-workout-suggestion-dialog";

interface WorkoutSessionFinishSuggestionProps {
  /** Whether the session has been finished; a finished one is never suggested. */
  isFinished: boolean;
  sessionId: string;
}

/**
 * Suggests finishing the session once its final set is saved. Mount it on
 * every screen of a workout session: it watches the session while mounted,
 * and only the focused screen shows the suggestion, so it appears wherever
 * the user is and only once. Finish behaves like the Finish Workout button;
 * Keep Training and dismissing just close it and leave the session active.
 */
export function WorkoutSessionFinishSuggestion({
  isFinished,
  sessionId,
}: WorkoutSessionFinishSuggestionProps) {
  const { dismiss, isSuggested } = useFinishWorkoutSuggestion(sessionId);
  const { finish, isFinishing } = useFinishWorkoutSession(sessionId);
  const isFocused = useIsFocused();

  // Finished some other way meanwhile: drop the suggestion for good.
  useEffect(() => {
    if (isFinished && isSuggested) {
      dismiss();
    }
  }, [dismiss, isFinished, isSuggested]);

  return (
    <FinishWorkoutSuggestionDialog
      isFinishing={isFinishing}
      onFinish={finish}
      onKeepTraining={dismiss}
      open={isSuggested && isFocused && !isFinished}
    />
  );
}
