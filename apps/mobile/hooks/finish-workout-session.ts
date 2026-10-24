import {
  countUnloggedSets,
  type MeasurementSystem,
  type PlanChanges,
  type WorkoutSession,
} from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import {
  type MutationFilters,
  type QueryClient,
  useIsMutating,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import { showPlanUpdatePrompt } from "~/hooks/plan-update-prompt";
import { useProfileQuery } from "~/hooks/queries/profiles";
import {
  FINISH_WORKOUT_SESSION_MUTATION_KEY,
  type FinishWorkoutSessionVariables,
  fetchPlanChanges,
  useFinishWorkoutSessionMutation,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import { rateLimitedFor } from "~/lib/api/client";
import { countPlanChanges, planUpdateProperties } from "~/lib/plan-changes";
import { segmentClient } from "~/lib/segment";

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

const alertFinishFailed = (waitSeconds: number | null = null) =>
  Alert.alert(
    "Couldn't finish workout",
    waitSeconds === null
      ? "Check your connection and try again."
      : `Too many requests: please try again in ${waitSeconds} s.`
  );

/**
 * What to ask after `sessionId` has finished: the changes it made to its
 * Workout and the User's unit for their weights, or null when there's
 * nothing to ask (no changes, or the Plan or Workout is gone). Throws when
 * either can't be read.
 */
async function planUpdateQuestion(
  queryClient: QueryClient,
  sessionId: string
): Promise<{
  measurementSystem: MeasurementSystem;
  preview: PlanChanges;
} | null> {
  const preview = await fetchPlanChanges(sessionId);
  if (preview.changes.length === 0 || !(preview.plan && preview.workout)) {
    return null;
  }
  // The lines show weights in the User's unit, never in a guessed one.
  const profile = await queryClient.ensureQueryData(
    useProfileQuery.getFetchOptions()
  );
  return {
    measurementSystem: profile?.measurement_system ?? "metric",
    preview,
  };
}

/** Sessions whose "Finish workout?" question is open, so it's never asked twice. */
const confirmingSessions = new Set<string>();

/**
 * Resolves whether to finish `sessionId`: true at once when every planned set
 * is logged, otherwise only once the user confirms. Reads the session from the
 * cache, fetching it when it isn't there; if that fetch fails it alerts and
 * resolves false, never treating an unreadable session as fully logged.
 * Resolves false while the question is already open for the session (a
 * repeated tap).
 */
async function confirmFinishWorkout(
  queryClient: QueryClient,
  sessionId: string
): Promise<boolean> {
  if (confirmingSessions.has(sessionId)) {
    return false;
  }
  confirmingSessions.add(sessionId);
  try {
    let session: WorkoutSession;
    try {
      session = await queryClient.ensureQueryData(
        useWorkoutSessionQuery.getFetchOptions({ sessionId })
      );
    } catch (error) {
      Sentry.captureException(error);
      alertFinishFailed();
      return false;
    }
    const unloggedSets = countUnloggedSets(session);
    if (unloggedSets === 0) {
      return true;
    }
    return await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Finish workout?",
        unloggedSets === 1
          ? "1 planned set isn't logged."
          : `${unloggedSets} planned sets aren't logged.`,
        [
          { onPress: () => resolve(false), style: "cancel", text: "Cancel" },
          { onPress: () => resolve(true), text: "Finish" },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    });
  } finally {
    confirmingSessions.delete(sessionId);
  }
}

/**
 * Finishes a workout session and opens its Summary. When the finished session
 * changed its Workout (replaced, added or removed Exercises, extra sets), the
 * "Update your plan?" sheet comes first (`PlanUpdateSheetHost`), and the
 * Summary opens once the User has answered it. If those changes can't be
 * read, it's reported and the Summary opens without asking: finishing never
 * fails because of it. Shared by every way of
 * finishing a session (the header's Finish button, the finish suggestion and
 * the Workout card), so they behave the same. `isFinishing` covers finishes
 * started from any screen, and `finish` does nothing while one is pending,
 * so the session is never finished twice. A failed finish shows an alert and
 * leaves the session active, so the user can try again.
 *
 * `screensAboveSession` is how many screens the caller sits above the
 * session screen (e.g. 1 for an exercise of the session). When that screen
 * is indeed this session's, the ones above it are closed before Summary
 * replaces it, so finishing from anywhere leaves the same stack as finishing
 * from the session screen.
 *
 * `outsideSession` is for callers that aren't one of the session's screens
 * (the Workout card on Home): Summary is pushed over the caller instead of
 * replacing it, so the stack ends the same as finishing from the session
 * screen.
 *
 * `confirmFinish` is for the header's Finish button and the Workout card: it
 * asks first when some planned sets aren't logged (see
 * `confirmFinishWorkout`). `finish` never asks, for the finish suggestion,
 * which only opens once every set is logged.
 */
export function useFinishWorkoutSession(
  sessionId: string,
  {
    outsideSession = false,
    screensAboveSession = 0,
  }: { outsideSession?: boolean; screensAboveSession?: number } = {}
): {
  confirmFinish: () => void;
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
      const waitSeconds = rateLimitedFor(error);
      // Too many requests is the User's to wait out, not a bug.
      if (waitSeconds === null) {
        Sentry.captureException(error);
      }
      alertFinishFailed(waitSeconds);
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
      const openSummary = () => {
        const summary = `/workout-sessions/${sessionId}/summary` as const;
        if (outsideSession) {
          router.push(summary);
          return;
        }
        if (
          isSessionScreenBelow(
            navigation.getState(),
            sessionId,
            screensAboveSession
          )
        ) {
          router.dismiss(screensAboveSession);
        }
        router.replace(summary);
      };
      let question: Awaited<ReturnType<typeof planUpdateQuestion>>;
      try {
        question = await planUpdateQuestion(queryClient, sessionId);
      } catch (error) {
        Sentry.captureException(error);
        openSummary();
        return;
      }
      if (!question) {
        openSummary();
        return;
      }
      const { measurementSystem, preview } = question;
      segmentClient.track("Plan Update Suggested", {
        ...countPlanChanges(preview.changes),
        ...planUpdateProperties(sessionId, preview),
      });
      showPlanUpdatePrompt({
        measurementSystem,
        onDone: openSummary,
        preview,
        sessionId,
      });
    },
  });

  const finish = useCallback(() => {
    if (queryClient.isMutating(filters) > 0) {
      return;
    }
    mutate({ sessionId });
  }, [filters, mutate, queryClient, sessionId]);

  const confirmFinish = useCallback(() => {
    confirmFinishWorkout(queryClient, sessionId).then((confirmed) => {
      if (confirmed) {
        finish();
      }
    });
  }, [finish, queryClient, sessionId]);

  return { confirmFinish, finish, isFinishing };
}
