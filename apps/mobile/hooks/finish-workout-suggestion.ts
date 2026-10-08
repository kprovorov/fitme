import {
  createFinishSuggestionController,
  type SetTrackedEvent,
} from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { fetchWorkoutSession } from "~/hooks/queries/workout-sessions";
import { storage } from "~/lib/mmkv";

const suggestedKey = (sessionId: string) =>
  `finish-suggestion.suggested.${sessionId}`;

// One controller for the app, so the once-per-session suppression holds across
// every screen of a workout session.
const controller = createFinishSuggestionController({
  // Straight from the server: the query cache may hold a read that predates
  // the save.
  loadSession: fetchWorkoutSession,
  onError: (error) => Sentry.captureException(error),
  // Persisted, so a restart mid-session does not suggest the session again.
  suggestedSessionStore: {
    add: (sessionId) => storage.set(suggestedKey(sessionId), true),
    has: (sessionId) => storage.getBoolean(suggestedKey(sessionId)) === true,
  },
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
 * dismissal). Unmounting the calling component dismisses it too, so a pending
 * suggestion never reappears when a screen is reopened.
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

  useEffect(() => dismiss, [dismiss]);

  return { dismiss, isSuggested: suggestedSessionId === sessionId };
}
