import {
  createFinishSuggestionController,
  type SetTrackedEvent,
} from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useCallback, useSyncExternalStore } from "react";
import { fetchWorkoutSession } from "~/hooks/queries/workout-sessions";

// One controller for the app, so the once-per-session suppression holds across
// every screen of a workout session.
const controller = createFinishSuggestionController({
  // Straight from the server: the query cache may hold a read that predates
  // the save.
  loadSession: fetchWorkoutSession,
  onError: (error) => Sentry.captureException(error),
});

/**
 * Report a successfully saved workout session set. Call it from the set
 * create/update mutation's `onSuccess` with the set's `reps_completed` before
 * the save (`null` for a new set) and the mutation result. Only a save that
 * tracks a previously untracked set and leaves the whole session tracked
 * suggests finishing, once per session.
 */
export const reportWorkoutSetTracked = (event: SetTrackedEvent): void => {
  controller.reportSetTracked(event);
};

/**
 * Whether to suggest finishing `sessionId`. `dismiss` hides the suggestion for
 * good; call it however the suggestion is closed (finish, keep training, or
 * dismissal).
 */
export function useFinishWorkoutSuggestion(sessionId: string): {
  dismiss: () => void;
  isSuggested: boolean;
} {
  const suggestedSessionId = useSyncExternalStore(
    controller.subscribe,
    controller.getSuggestedSessionId
  );
  const dismiss = useCallback(() => controller.dismiss(sessionId), [sessionId]);

  return { dismiss, isSuggested: suggestedSessionId === sessionId };
}
