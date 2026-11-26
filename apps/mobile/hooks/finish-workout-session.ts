import { rateLimitedFor } from "@fitme/api-client";
import { countLoggedSets, countUnloggedSets } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import type { AlertButton } from "react-native";

import { withoutRemovedSets } from "~/hooks/added-sets";
import {
  claimEndingQuestion,
  isSessionRoute,
  readsChangedByFinish,
} from "~/hooks/ending-workout-session";
import { showPlanUpdatePrompt } from "~/hooks/plan-update-prompt";
import {
  discardingFilters,
  fetchPlanUpdate,
  finishingFilters,
  seedWorkoutSession,
  useFinishWorkoutSessionMutation,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import type {
  DiscardSource,
  WorkoutSession,
} from "~/hooks/queries/workout-sessions";
import { i18n } from "~/lib/i18n";
import {
  countPlanChanges,
  hasPlanUpdate,
  planUpdateProperties,
} from "~/lib/plan-changes";
import type { PlanUpdate } from "~/lib/plan-changes";
import { segmentClient } from "~/lib/segment";
import { isStillWriteStarter, rememberWriteStarter } from "~/lib/write-answers";

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

  return isSessionRoute(state.routes[state.index - screensAbove], sessionId);
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
 * its `weight_unit`, or null when there's nothing to ask (no changes and no set
 * removals, or the Plan or Workout is gone). Throws when it can't be read.
 */
const planUpdateQuestion = async (
  sessionId: string
): Promise<PlanUpdate | null> => {
  const preview = await fetchPlanUpdate(sessionId);

  if (!hasPlanUpdate(preview) || !(preview.plan && preview.workout)) {
    return null;
  }

  return preview;
};

/**
 * Calls `onFinish` when every planned set is logged, otherwise only once the
 * user confirms. With no set logged at all (none planned included) the
 * question offers `onDiscard` too, so an empty session isn't saved by
 * accident. Reads the session from the cache, fetching it when it isn't
 * there; if that fetch fails it alerts and skips finishing, never treating an
 * unreadable session as fully logged.
 * Asks nothing while a question about ending the session is already open (a
 * repeated tap, or the menu's "Discard workout?").
 */
const confirmFinishWorkout = async (
  queryClient: QueryClient,
  sessionId: string,
  { onDiscard, onFinish }: { onDiscard: () => void; onFinish: () => void }
): Promise<void> => {
  // Who is asked: another User may be signed in once it's answered.
  const asked = rememberWriteStarter(queryClient, []);
  let session: WorkoutSession;

  try {
    // A set being removed isn't asked about, whatever the read still says.
    session = withoutRemovedSets(
      // oxlint-disable-next-line typescript/no-deprecated -- This cache-only fallback must keep ensureQueryData semantics on Query v5.
      await queryClient.ensureQueryData(
        useWorkoutSessionQuery.getFetchOptions({ sessionId })
      )
    );
  } catch (error) {
    Sentry.captureException(error);
    alertFinishFailed();

    return;
  }

  const nothingLogged = countLoggedSets(session) === 0;
  const unloggedSets = countUnloggedSets(session);

  if (unloggedSets === 0 && !nothingLogged) {
    onFinish();

    return;
  }

  const question = claimEndingQuestion(queryClient, sessionId);

  if (!question) {
    return;
  }

  let answered = false;

  const answer = (onAnswer?: () => void) => {
    if (answered) {
      return;
    }

    answered = true;
    question.release();

    // Ended elsewhere while it was asked: its screens have moved on.
    if (!question.isRevoked()) {
      onAnswer?.();
    }
  };

  const discardButton: AlertButton = {
    onPress: () =>
      answer(() => {
        if (isStillWriteStarter(asked)) {
          onDiscard();
        }
      }),
    style: "destructive",
    text: i18n.t("discardWorkout.confirm.discard"),
  };

  Alert.alert(
    i18n.t("finishWorkout.confirm.title"),
    nothingLogged
      ? i18n.t("discardWorkout.confirm.nothingLogged")
      : i18n.t("finishWorkout.confirm.unloggedSets", { count: unloggedSets }),
    [
      {
        onPress: () => answer(),
        style: "cancel",
        text: i18n.t("finishWorkout.confirm.cancel"),
      },
      ...(nothingLogged ? [discardButton] : []),
      {
        onPress: () => answer(onFinish),
        text: i18n.t("finishWorkout.confirm.finish"),
      },
    ],
    { cancelable: true, onDismiss: () => answer() }
  );
};

/**
 * Finishes a workout session and opens its Summary. When the finished session
 * changed its Workout (replaced, added or removed Exercises, added or removed
 * sets), the "Update your plan?" sheet comes first (`PlanUpdateSheetHost`), and
 * the Summary opens once the User has answered it. If those changes can't be
 * read, it's reported and the Summary opens without asking: finishing never
 * fails because of it. Shared by every way of
 * finishing a session (the header's Finish button and the finish
 * suggestion), so they behave the same. `isFinishing` covers finishes
 * started from any screen, and `finish` does nothing while one is pending
 * (or a discard, `useDiscardWorkoutSession`), so the session is never finished
 * twice. A failed finish shows an alert and leaves the session active, so the
 * user can try again.
 *
 * `screensAboveSession` is how many screens the caller sits above the
 * session screen (e.g. 1 for an exercise of the session). When that screen
 * is indeed this session's, the ones above it are closed before Summary
 * replaces it, so finishing from anywhere leaves the same stack as finishing
 * from the session screen.
 *
 * `confirmFinish` is for the header's Finish button: it
 * asks first when some planned sets aren't logged, and when no set is logged
 * at all, where it offers the given `discard` (`useDiscardWorkoutSession`'s,
 * which never asks again) too (see `confirmFinishWorkout`). `finish` never
 * asks, for the finish suggestion, which only opens once every set is logged.
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
      const seeded = await seedWorkoutSession(
        queryClient,
        starter,
        session,
        readsChangedByFinish()
      );

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

      void segmentClient.track("Plan Update Suggested", {
        ...countPlanChanges(preview),
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
    if (
      queryClient.isMutating(filters) > 0 ||
      queryClient.isMutating(discardingFilters(sessionId)) > 0
    ) {
      return;
    }

    mutate({ sessionId });
  }, [filters, mutate, queryClient, sessionId]);

  const confirmFinish = useCallback(
    (discard: (source: DiscardSource) => void) => {
      if (queryClient.isMutating(discardingFilters(sessionId)) > 0) {
        return;
      }

      void confirmFinishWorkout(queryClient, sessionId, {
        onDiscard: () => discard("finish_alert"),
        onFinish: finish,
      });
    },
    [finish, queryClient, sessionId]
  );

  return { confirmFinish, finish, isFinishing };
};
