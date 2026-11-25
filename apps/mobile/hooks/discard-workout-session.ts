import { rateLimitedFor } from "@fitme/api-client";
import { countLoggedSets } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
import type {
  NavigationProp,
  ParamListBase,
} from "expo-router/react-navigation";
import { useCallback, useMemo, useRef } from "react";
import { Alert } from "react-native";

import { forgetAddedSets } from "~/hooks/added-sets";
import {
  isSessionRoute,
  readsChangedByFinish,
} from "~/hooks/ending-workout-session";
import {
  discardingFilters,
  finishingFilters,
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  useDiscardWorkoutSessionMutation,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import type {
  DiscardSource,
  OpenWorkoutSession,
  WorkoutSession,
} from "~/hooks/queries/workout-sessions";
import { IS_E2E } from "~/lib/constants";
import { i18n } from "~/lib/i18n";
import { segmentClient } from "~/lib/segment";
import { isStillWriteStarter, rememberWriteStarter } from "~/lib/write-answers";
import type { WriteStarter } from "~/lib/write-answers";

/** Home's route in the root stack. */
const HOME_ROUTE = "(tabs)";

/**
 * Closes the session's own screens wherever they are in the stack, since the
 * User may have opened or left some while the server answered: what they came
 * from shows again, or Home when nothing is behind. Any other screen stays.
 */
const leaveSession = (
  navigation: NavigationProp<ParamListBase>,
  sessionId: string
): void => {
  const state = navigation.getState();

  if (!state) {
    return;
  }

  const firstOwn = state.routes.findIndex((route) =>
    isSessionRoute(route, sessionId)
  );

  if (firstOwn === -1) {
    return;
  }

  const kept = state.routes.filter(
    (route) => !isSessionRoute(route, sessionId)
  );

  const routes = firstOwn === 0 ? [{ name: HOME_ROUTE }, ...kept] : kept;

  navigation.dispatch({
    ...CommonActions.reset({ ...state, index: routes.length - 1, routes }),
    target: state.key,
  });
};

/**
 * Drops a read once no screen shows it. Dropped under a screen still
 * mounted, it would be read again and show the API's 404.
 */
const dropOnceUnused = (client: QueryClient, queryKey: QueryKey): void => {
  const cache = client.getQueryCache();
  const query = cache.find({ exact: true, queryKey });

  if (!query) {
    return;
  }

  if (query.getObserversCount() === 0) {
    cache.remove(query);

    return;
  }

  const unsubscribe = cache.subscribe((event) => {
    if (event.query !== query) {
      return;
    }

    if (event.type === "removed") {
      unsubscribe();
    } else if (
      event.type === "observerRemoved" &&
      query.getObserversCount() === 0
    ) {
      unsubscribe();
      cache.remove(query);
    }
  });
};

const alertDiscardFailed = (waitSeconds: number | null) =>
  Alert.alert(
    i18n.t("discardWorkout.failed.title"),
    waitSeconds === null
      ? i18n.t("discardWorkout.failed.network")
      : i18n.t("discardWorkout.failed.rateLimited", { seconds: waitSeconds })
  );

/**
 * Discards an open Workout Session for good, as if it had never been started.
 * Every way of discarding goes through it: `confirmDiscard` asks first (the
 * session screen's menu), `discard` is for a caller that has already asked.
 *
 * It waits for the server: the session is read again and, only while it's
 * still open, deleted (`useDiscardWorkoutSessionMutation`). Once it's gone its
 * own screens close, whatever else is open, and nothing else is shown. One
 * finished elsewhere is shown finished, with an alert. A failure shows an
 * alert and keeps the session, so the User can try again. Nothing happens
 * while the session is already being discarded or finished, nor once the
 * User who asked has signed out.
 */
export const useDiscardWorkoutSession = (sessionId: string) => {
  const queryClient = useQueryClient();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const filters = useMemo(() => discardingFilters(sessionId), [sessionId]);
  const isDiscarding = useIsMutating(filters) > 0;

  const { mutate } = useDiscardWorkoutSessionMutation({
    onError: (error, { starter }) => {
      const waitSeconds = rateLimitedFor(error);

      // Too many requests is the User's to wait out, not a bug.
      if (waitSeconds === null) {
        Sentry.captureException(error);
      }

      // Never alert the next User about the previous one's discard.
      if (isStillWriteStarter(starter)) {
        alertDiscardFailed(waitSeconds);
      }
    },
    onSuccess: async (result, { source, starter }) => {
      const queryKey = useWorkoutSessionQuery.getKey({ sessionId });

      if (result.status === "signed-out" || !isStillWriteStarter(starter)) {
        return;
      }

      // A read in flight was asked before the answer.
      await Promise.all([
        queryClient.cancelQueries({ exact: true, queryKey }),
        queryClient.cancelQueries({ queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY }),
      ]);

      if (!isStillWriteStarter(starter)) {
        return;
      }

      if (result.status === "finished") {
        queryClient.setQueryData(queryKey, result.session);
        Alert.alert(i18n.t("discardWorkout.alreadyFinished.title"));

        // What that finish changed, as after one of this phone's own.
        for (const changed of readsChangedByFinish()) {
          void queryClient.invalidateQueries(changed);
        }

        return;
      }

      const shown = queryClient.getQueryData<WorkoutSession>(queryKey);
      const deleted = result.status === "discarded" ? result.session : shown;

      leaveSession(navigation, sessionId);
      dropOnceUnused(queryClient, queryKey);
      forgetAddedSets(
        [...(shown?.exercises ?? []), ...(deleted?.exercises ?? [])].map(
          ({ id }) => id
        )
      );

      // Start is free at once, even if reading it again fails.
      queryClient.setQueryData<OpenWorkoutSession | null>(
        OPEN_WORKOUT_SESSION_QUERY_KEY,
        (open) => (open?.id === sessionId ? null : open)
      );
      void queryClient.invalidateQueries({
        queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
      });
      void queryClient.invalidateQueries({ queryKey: ["exercise-history"] });

      if (!IS_E2E) {
        void segmentClient.track("Workout Discarded", {
          logged_set_count: deleted ? countLoggedSets(deleted) : 0,
          source,
        });
      }
    },
  });

  const isBusy = useCallback(
    () =>
      queryClient.isMutating(filters) > 0 ||
      queryClient.isMutating(finishingFilters(sessionId)) > 0,
    [filters, queryClient, sessionId]
  );

  const requestDiscard = useCallback(
    (source: DiscardSource, starter: WriteStarter) => {
      if (!isBusy() && isStillWriteStarter(starter)) {
        mutate({ sessionId, source, starter });
      }
    },
    [isBusy, mutate, sessionId]
  );

  const discard = useCallback(
    (source: DiscardSource) =>
      requestDiscard(source, rememberWriteStarter(queryClient, [])),
    [queryClient, requestDiscard]
  );

  // Whether the question is open, so a repeated tap never asks it twice.
  const asking = useRef<boolean>(false);

  const confirmDiscard = useCallback(
    (session: WorkoutSession, source: DiscardSource) => {
      if (asking.current || isBusy()) {
        return;
      }

      asking.current = true;

      // Who is asked: another User may be signed in once it's answered.
      const starter = rememberWriteStarter(queryClient, []);
      const loggedSets = countLoggedSets(session);

      Alert.alert(
        i18n.t("discardWorkout.confirm.title"),
        loggedSets === 0
          ? i18n.t("discardWorkout.confirm.nothingLogged")
          : i18n.t("discardWorkout.confirm.loggedSets", { count: loggedSets }),
        [
          {
            onPress: () => {
              asking.current = false;
            },
            style: "cancel",
            text: i18n.t("discardWorkout.confirm.keepTraining"),
          },
          {
            onPress: () => {
              asking.current = false;
              requestDiscard(source, starter);
            },
            style: "destructive",
            text: i18n.t("discardWorkout.confirm.discard"),
          },
        ],
        {
          cancelable: true,
          onDismiss: () => {
            asking.current = false;
          },
        }
      );
    },
    [isBusy, queryClient, requestDiscard]
  );

  return { confirmDiscard, discard, isDiscarding };
};
