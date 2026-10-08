import * as Sentry from "@sentry/react-native";
import {
  type MutationFilters,
  useIsMutating,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
  FINISH_WORKOUT_SESSION_MUTATION_KEY,
  type FinishWorkoutSessionVariables,
  useFinishWorkoutSessionMutation,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";

const finishingFilters = (sessionId: string): MutationFilters => ({
  mutationKey: FINISH_WORKOUT_SESSION_MUTATION_KEY,
  predicate: (mutation) =>
    (mutation.state.variables as FinishWorkoutSessionVariables | undefined)
      ?.sessionId === sessionId,
  status: "pending",
});

interface NavigationState {
  index: number;
  routes: Array<{ params?: object }>;
}

/**
 * Whether the screen `screensAbove` below the current one shows `sessionId`,
 * e.g. not when an exercise screen was opened straight from a link.
 */
const isSessionScreenBelow = (
  state: NavigationState | undefined,
  sessionId: string,
  screensAbove: number
): boolean => {
  if (!state || screensAbove <= 0) {
    return false;
  }
  const params = state.routes[state.index - screensAbove]?.params as
    | { sessionId?: string; workoutSessionId?: string }
    | undefined;
  return (
    params?.sessionId === sessionId || params?.workoutSessionId === sessionId
  );
};

/**
 * Finishes a workout session and opens its Summary. Shared by every way of
 * finishing a session from its screens (the Finish Workout button and the
 * finish suggestion), so they behave the same. `isFinishing` covers finishes
 * started from any screen, and `finish` does nothing while one is pending,
 * so the session is never finished twice. A failed finish shows an alert and
 * leaves the session active, so the user can try again.
 *
 * `screensAboveSession` is how many screens the caller sits above the
 * session screen (e.g. 1 for an exercise of the session). When that screen
 * is indeed this session's, the ones above it are closed before Summary
 * replaces it, so finishing from anywhere leaves the same stack as finishing
 * from the session screen.
 */
export function useFinishWorkoutSession(
  sessionId: string,
  { screensAboveSession = 0 }: { screensAboveSession?: number } = {}
): {
  finish: () => void;
  isFinishing: boolean;
} {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigation = useNavigation();
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
    onSuccess: async (session) => {
      // Every screen sees the session finished right away, even if a refetch
      // below fails.
      queryClient.setQueryData(
        useWorkoutSessionQuery.getKey({ sessionId }),
        session
      );
      await queryClient.invalidateQueries({ queryKey: ["workout-session"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["exercise-history"] });
      if (
        isSessionScreenBelow(
          navigation.getState(),
          sessionId,
          screensAboveSession
        )
      ) {
        router.dismiss(screensAboveSession);
      }
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
