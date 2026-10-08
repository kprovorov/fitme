import * as Sentry from "@sentry/react-native";
import {
  type MutationFilters,
  useIsMutating,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
  FINISH_WORKOUT_SESSION_MUTATION_KEY,
  type FinishWorkoutSessionVariables,
  useFinishWorkoutSessionMutation,
} from "~/hooks/queries/workout-sessions";

const finishingFilters = (sessionId: string): MutationFilters => ({
  mutationKey: FINISH_WORKOUT_SESSION_MUTATION_KEY,
  predicate: (mutation) =>
    (mutation.state.variables as FinishWorkoutSessionVariables | undefined)
      ?.sessionId === sessionId,
  status: "pending",
});

/**
 * Finishes a workout session and opens its Summary. Shared by every way of
 * finishing a session from its screens (the Finish Workout button and the
 * finish suggestion), so they behave the same. `isFinishing` covers finishes
 * started from any screen, and `finish` does nothing while one is pending,
 * so the session is never finished twice. A failed finish shows an alert and
 * leaves the session active, so the user can try again.
 */
export function useFinishWorkoutSession(sessionId: string): {
  finish: () => void;
  isFinishing: boolean;
} {
  const queryClient = useQueryClient();
  const router = useRouter();
  const filters = useMemo(() => finishingFilters(sessionId), [sessionId]);
  const isFinishing = useIsMutating(filters) > 0;

  const { mutate } = useFinishWorkoutSessionMutation({
    onError: (error) => {
      Sentry.captureException(error);
      Alert.alert(
        "Couldn't finish workout",
        "Check your connection and try again."
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["exercise-history"] });
      router.replace(`/workout-sessions/${sessionId}/summary`);
    },
  });

  const finish = useCallback(() => {
    if (queryClient.isMutating(filters) > 0) {
      return;
    }
    mutate({ sessionId });
  }, [filters, mutate, queryClient, sessionId]);

  return { finish, isFinishing };
}
