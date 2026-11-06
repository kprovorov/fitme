import { rateLimitedFor } from "@fitme/api-client";
import { countUnloggedSets } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import type { MutationFilters, QueryClient } from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";

import { showPlanUpdatePrompt } from "~/hooks/plan-update-prompt";
import { PLANS_QUERY_KEY, usePlanQuery } from "~/hooks/queries/plans";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
import {
  FINISH_WORKOUT_SESSION_MUTATION_KEY,
  fetchPlanUpdate,
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  seedWorkoutSession,
  useFinishWorkoutSessionMutation,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import type {
  FinishWorkoutSessionVariables,
  WorkoutSession,
} from "~/hooks/queries/workout-sessions";
import { i18n } from "~/lib/i18n";
import { countPlanChanges, planUpdateProperties } from "~/lib/plan-changes";
import type { PlanUpdate } from "~/lib/plan-changes";
import { segmentClient } from "~/lib/segment";
import { isStillWriteStarter } from "~/lib/write-answers";

const finishingFilters = (sessionId: string): MutationFilters => ({
  mutationKey: FINISH_WORKOUT_SESSION_MUTATION_KEY,
  // SAFETY: This mutation key selects finishes whose variables are FinishWorkoutSessionVariables.
  predicate: (mutation) =>
    (mutation.state.variables as FinishWorkoutSessionVariables | undefined)
      ?.sessionId === sessionId,
  status: "pending",
});

interface NavigationState {
  index: number;
  routes: { params?: object }[];
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

  const params = state.routes[state.index - screensAbove]?.params;

  if (!params) {
    return false;
  }

  return (
    ("sessionId" in params && params.sessionId === sessionId) ||
    ("workoutSessionId" in params && params.workoutSessionId === sessionId)
  );
};

const alertFinishFailed = (waitSeconds: number | null = null) =>
  Alert.alert(
    i18n.t("finishWorkout.failed.title"),
    waitSeconds === null
      ? i18n.t("finishWorkout.failed.network")
      : i18n.t("finishWorkout.failed.rateLimited", { seconds: waitSeconds })
  );

/**
 * What to ask after `sessionId` has finished: its Plan Update, weights in
 * its `weight_unit`, or null when there's nothing to ask (no changes, or the
 * Plan or Workout is gone). Throws when it can't be read.
 */
const planUpdateQuestion = async (
  sessionId: string
): Promise<PlanUpdate | null> => {
  const preview = await fetchPlanUpdate(sessionId);

  if (preview.changes.length === 0 || !(preview.plan && preview.workout)) {
    return null;
  }

  return preview;
};

/** Sessions whose "Finish workout?" question is open, so it's never asked twice. */
const confirmingSessions = new Set<string>();

/**
 * Calls `onConfirm` when every planned set is logged, otherwise only once the
 * user confirms. Reads the session from the cache, fetching it when it isn't
 * there; if that fetch fails it alerts and skips finishing, never treating an
 * unreadable session as fully logged.
 * Does nothing while the question is already open for the session (a
 * repeated tap).
 */
const confirmFinishWorkout = async (
  queryClient: QueryClient,
  sessionId: string,
  onConfirm: () => void
): Promise<void> => {
  if (confirmingSessions.has(sessionId)) {
    return;
  }

  confirmingSessions.add(sessionId);
  let awaitingConfirmation = false;

  try {
    let session: WorkoutSession;

    try {
      session = await queryClient.ensureQueryData(
        useWorkoutSessionQuery.getFetchOptions({ sessionId })
      );
    } catch (error) {
      Sentry.captureException(error);
      alertFinishFailed();

      return;
    }

    const unloggedSets = countUnloggedSets(session);

    if (unloggedSets === 0) {
      confirmingSessions.delete(sessionId);
      onConfirm();

      return;
    }

    let answered = false;

    const answer = (confirmed: boolean) => {
      if (answered) {
        return;
      }

      answered = true;
      confirmingSessions.delete(sessionId);

      if (confirmed) {
        onConfirm();
      }
    };

    Alert.alert(
      i18n.t("finishWorkout.confirm.title"),
      i18n.t("finishWorkout.confirm.unloggedSets", { count: unloggedSets }),
      [
        {
          onPress: () => answer(false),
          style: "cancel",
          text: i18n.t("finishWorkout.confirm.cancel"),
        },
        {
          onPress: () => answer(true),
          text: i18n.t("finishWorkout.confirm.finish"),
        },
      ],
      { cancelable: true, onDismiss: () => answer(false) }
    );
    awaitingConfirmation = true;
  } catch (error) {
    Sentry.captureException(error);
  } finally {
    if (!awaitingConfirmation) {
      confirmingSessions.delete(sessionId);
    }
  }
};

/**
 * Finishes a workout session and opens its Summary. When the finished session
 * changed its Workout (replaced, added or removed Exercises, extra sets), the
 * "Update your plan?" sheet comes first (`PlanUpdateSheetHost`), and the
 * Summary opens once the User has answered it. If those changes can't be
 * read, it's reported and the Summary opens without asking: finishing never
 * fails because of it. Shared by every way of
 * finishing a session (the header's Finish button and the finish
 * suggestion), so they behave the same. `isFinishing` covers finishes
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
 * `confirmFinish` is for the header's Finish button: it
 * asks first when some planned sets aren't logged (see
 * `confirmFinishWorkout`). `finish` never asks, for the finish suggestion,
 * which only opens once every set is logged.
 */
export const useFinishWorkoutSession = (
  sessionId: string,
  { screensAboveSession = 0 }: { screensAboveSession?: number } = {}
) => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigation = useNavigation();
  const filters = useMemo(() => finishingFilters(sessionId), [sessionId]);
  const isFinishing = useIsMutating(filters) > 0;

  const { mutate } = useFinishWorkoutSessionMutation({
    onError: (error, _variables, starter) => {
      const waitSeconds = rateLimitedFor(error);

      // Too many requests is the User's to wait out, not a bug.
      if (waitSeconds === null) {
        Sentry.captureException(error);
      }

      // Never alert the next User about the previous one's finish.
      if (isStillWriteStarter(starter)) {
        alertFinishFailed(waitSeconds);
      }
    },
    // Signed out (or another User signed in) before the answer, or at any
    // step after it: the rest is the previous User's, so it neither shows,
    // nor reads, nor opens anything.
    onSuccess: async (session, _variables, starter) => {
      // Every screen of it (the Summary included) shows the answer, with no
      // re-read (or reads it again, when a newer read landed meanwhile), and
      // the reads it changed are read again.
      const seeded = await seedWorkoutSession(queryClient, starter, session, [
        // Its Workout moved to the end of the rotation.
        { queryKey: PLANS_QUERY_KEY },
        { queryKey: usePlanQuery.getKey() },
        { queryKey: ["exercise-history"] },
        // History's months and Weekly goal chart count it now (a finish may
        // also start goal tracking)
        { queryKey: ["workout-sessions-history"] },
        { queryKey: WEEKLY_GOALS_QUERY_KEY },
        // Start is no longer blocked on it.
        { queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY },
      ]);

      if (seeded === "signed-out") {
        return;
      }

      const openSummary = () => {
        if (!isStillWriteStarter(starter)) {
          return;
        }

        const summary = `/workout-sessions/${sessionId}/summary` as const;

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

      let preview: PlanUpdate | null;

      try {
        preview = await planUpdateQuestion(sessionId);
      } catch (error) {
        Sentry.captureException(error);
        openSummary();

        return;
      }

      if (!preview) {
        openSummary();

        return;
      }

      if (!isStillWriteStarter(starter)) {
        return;
      }

      segmentClient.track("Plan Update Suggested", {
        ...countPlanChanges(preview.changes),
        ...planUpdateProperties(sessionId, preview),
      });
      showPlanUpdatePrompt({
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
    void confirmFinishWorkout(queryClient, sessionId, finish);
  }, [finish, queryClient, sessionId]);

  return { confirmFinish, finish, isFinishing };
};
