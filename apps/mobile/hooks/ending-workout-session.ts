import type {
  InvalidateQueryFilters,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";
import { CommonActions } from "expo-router/react-navigation";
import type {
  NavigationProp,
  ParamListBase,
} from "expo-router/react-navigation";

import { forgetAddedSets } from "~/hooks/added-sets";
import { PLANS_QUERY_KEY, usePlanQuery } from "~/hooks/queries/plans";
import { WEEKLY_GOALS_QUERY_KEY } from "~/hooks/queries/weekly-goals";
import {
  LIFETIME_TOTALS_QUERY_KEY,
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import type {
  OpenWorkoutSession,
  WorkoutSession,
} from "~/hooks/queries/workout-sessions";

/**
 * The Workout Session each open Exercise picker's choice keys belong to: the
 * Muscles and Equipment sheets it opens carry only that key, and close with
 * the session's screens.
 */
const sessionOfChoiceKey = new Map<string, string>();

/**
 * Makes the choice sheets opened under these keys screens of the session,
 * until the returned function is called (the picker closing).
 */
export const holdSessionChoiceKeys = (
  sessionId: string,
  keys: readonly string[]
): (() => void) => {
  for (const key of keys) {
    sessionOfChoiceKey.set(key, sessionId);
  }

  return () => {
    for (const key of keys) {
      if (sessionOfChoiceKey.get(key) === sessionId) {
        sessionOfChoiceKey.delete(key);
      }
    }
  };
};

/**
 * Whether a route is one of the session's own screens: its Exercise picker
 * included, and the choice sheets the picker opened.
 */
export const isSessionRoute = (
  route: { params?: object } | undefined,
  sessionId: string
): boolean => {
  const params = route?.params;

  return (
    !!params &&
    (("sessionId" in params && params.sessionId === sessionId) ||
      ("workoutSessionId" in params && params.workoutSessionId === sessionId) ||
      ("choice" in params &&
        [...sessionOfChoiceKey].some(
          ([key, owner]) => key === params.choice && owner === sessionId
        )))
  );
};

/** A question about ending a Workout Session that's on screen. */
interface EndingQuestion {
  /** Whether the session has ended meanwhile, so an answer does nothing. */
  isRevoked: () => boolean;
  /** To call once it's answered or dismissed. */
  release: () => void;
}

/** Each client's questions on screen, by Workout Session id. */
const openQuestions = new WeakMap<
  QueryClient,
  Map<string, { revoked: boolean }>
>();

/**
 * Claims the one question that may be open about ending the session ("Finish
 * workout?" or "Discard workout?"), or answers null while one is already open.
 */
export const claimEndingQuestion = (
  client: QueryClient,
  sessionId: string
): EndingQuestion | null => {
  const open =
    openQuestions.get(client) ?? new Map<string, { revoked: boolean }>();

  if (open.has(sessionId)) {
    return null;
  }

  const question = { revoked: false };
  open.set(sessionId, question);
  openQuestions.set(client, open);

  return {
    isRevoked: () => question.revoked,
    release: () => {
      // A late second call never frees a question asked since.
      if (open.get(sessionId) === question) {
        open.delete(sessionId);
      }
    },
  };
};

/** Makes answering the question open about ending the session do nothing. */
export const revokeEndingQuestion = (
  client: QueryClient,
  sessionId: string
): void => {
  const open = openQuestions.get(client);
  const question = open?.get(sessionId);

  if (question) {
    question.revoked = true;
    open?.delete(sessionId);
  }
};

/** The reads a finish changes, besides the Workout Session's own. */
export const readsChangedByFinish = (): InvalidateQueryFilters[] => [
  // Its Workout moved to the end of the rotation.
  { queryKey: PLANS_QUERY_KEY },
  { queryKey: usePlanQuery.getKey() },
  { queryKey: ["exercise-history"] },
  // History's months and Weekly goal chart count it now (a finish may
  // also start goal tracking)
  { queryKey: ["workout-sessions-history"] },
  { queryKey: WEEKLY_GOALS_QUERY_KEY },
  // Profile's Lifetime totals count it too.
  { queryKey: LIFETIME_TOTALS_QUERY_KEY },
  // Start is no longer blocked on it.
  { queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY },
];

/** Home's route in the root stack. */
const HOME_ROUTE = "(tabs)";

/** The Summary's route in the root stack. */
const SUMMARY_ROUTE = "workout-sessions/[workoutSessionId]/summary";

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

/**
 * Replaces the session's own screens, wherever they are in the stack, with
 * its Summary. Any other screen stays, even over it.
 */
export const replaceSessionWithSummary = (
  navigation: NavigationProp<ParamListBase>,
  sessionId: string
): void => {
  const state = navigation.getState();

  if (!state) {
    return;
  }

  const isOwn = (route: { params?: object }) =>
    isSessionRoute(route, sessionId);

  const own = state.routes.filter(isOwn);

  // Another screen of the session has already done it.
  if (own.every(({ name }) => name === SUMMARY_ROUTE)) {
    return;
  }

  const routes = state.routes.flatMap<{ name: string; params?: object }>(
    (route) => {
      if (route === own[0]) {
        return [
          { name: SUMMARY_ROUTE, params: { workoutSessionId: sessionId } },
        ];
      }

      return isOwn(route) ? [] : [route];
    }
  );

  navigation.dispatch({
    ...CommonActions.reset({ ...state, index: routes.length - 1, routes }),
    target: state.key,
  });
};

/**
 * What follows once the session is deleted: its own screens close, its read
 * and its added sets (those of `shown`, the session as it was known) are
 * dropped, and the reads a discard changes are read again.
 */
export const closeDiscardedSession = (
  client: QueryClient,
  navigation: NavigationProp<ParamListBase>,
  sessionId: string,
  shown: (WorkoutSession | undefined)[]
): void => {
  leaveSession(navigation, sessionId);
  dropOnceUnused(client, useWorkoutSessionQuery.getKey({ sessionId }));
  forgetAddedSets(
    shown.flatMap((session) => session?.exercises.map(({ id }) => id) ?? [])
  );

  // Start is free at once, even if reading it again fails.
  client.setQueryData<OpenWorkoutSession | null>(
    OPEN_WORKOUT_SESSION_QUERY_KEY,
    (open) => (open?.id === sessionId ? null : open)
  );
  void client.invalidateQueries({ queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY });
  void client.invalidateQueries({ queryKey: ["exercise-history"] });
};

/**
 * Whether leaving a Workout Session's Screen goes without asking about an
 * unsaved note: its screens moving on by themselves (it ended elsewhere, or a
 * finish or discard elsewhere in the app), which reset the stack. Unsaved
 * text is lost then, as the sets' unsaved input is; the User's own way back
 * still asks.
 */
export const isSessionMovingOn = ({ type }: { type: string }): boolean =>
  type === "RESET";
