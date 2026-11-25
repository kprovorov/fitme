import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import type {
  NavigationProp,
  ParamListBase,
} from "expo-router/react-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  closeDiscardedSession,
  readsChangedByFinish,
  replaceSessionWithSummary,
  revokeEndingQuestion,
} from "~/hooks/ending-workout-session";
import {
  discardingFilters,
  finishingFilters,
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  useWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import { isStillWriteStarter, rememberWriteStarter } from "~/lib/write-answers";
import type { WriteStarter } from "~/lib/write-answers";

/** How often an open Workout Session on screen is read again. */
const POLL_MS = 30_000;

/** What a mounted screen knows about the Workout Session it shows. */
interface Watch {
  hasMovedOn: boolean;
  /** Who was signed in when it was first shown open, `null` while it wasn't. */
  openFor: WriteStarter | null;
  sessionId: string;
}

const startWatch = (sessionId: string): Watch => ({
  hasMovedOn: false,
  openFor: null,
  sessionId,
});

/** Whether the app is in the foreground. */
const useIsAppActive = (): boolean => {
  const [isActive, setIsActive] = useState(
    () =>
      AppState.currentState !== "background" &&
      AppState.currentState !== "inactive"
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setIsActive(state === "active")
    );

    return () => subscription.remove();
  }, []);

  return isActive;
};

/**
 * Moves a screen of a Workout Session on when the session ends elsewhere: the
 * job that closes a Forgotten Workout Session, an MCP client, another phone.
 *
 * While the session is open it's read again every 30 seconds, and whenever
 * the app returns to the foreground (never in the background). Shown open and
 * then read finished, its screens are replaced by its Summary; read gone (the
 * API's 404), they close as after a discard. Neither says anything or asks
 * the Plan Update. Any other failed read changes nothing, and a session first
 * shown finished stays as it is and is never polled.
 *
 * The app's own Finish and Discard go first: nothing is read or moved while
 * one is pending, nor once one has succeeded, since each shows what comes
 * next itself. Nothing is read or moved once the User it was shown to has
 * signed out.
 */
export const useEndedWorkoutSession = (sessionId: string): void => {
  const queryClient = useQueryClient();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const finishing = useMemo(() => finishingFilters(sessionId), [sessionId]);
  const discarding = useMemo(() => discardingFilters(sessionId), [sessionId]);
  const finishes = useIsMutating(finishing);
  const discards = useIsMutating(discarding);
  const isEnding = finishes + discards > 0;
  const isAppActive = useIsAppActive();
  const watch = useRef<Watch | null>(null);

  const { data, dataUpdatedAt, error, errorUpdatedAt, refetch } =
    useWorkoutSessionQuery({ variables: { sessionId } });

  const isFinished = !!data?.finished_at;
  const isOpen = !!data && !isFinished;

  const isGone =
    isOpen && error instanceof ApiError && error.code === "not_found";

  useEffect(() => {
    if (watch.current?.sessionId !== sessionId) {
      watch.current = startWatch(sessionId);
    }

    const watched = watch.current;

    if (isOpen && !watched.openFor) {
      watched.openFor = rememberWriteStarter(queryClient, []);
    }

    const { openFor } = watched;
    const mutations = queryClient.getMutationCache();

    // The app's own Finish or Discard ended it, and shows what comes next. A
    // mounted screen keeps its last one in the cache.
    const endedHere = [finishing, discarding].some(
      (filters) =>
        mutations.findAll({ ...filters, status: "success" }).length > 0
    );

    if (
      !(openFor && (isFinished || isGone)) ||
      isEnding ||
      endedHere ||
      watched.hasMovedOn ||
      !isStillWriteStarter(openFor)
    ) {
      return;
    }

    watched.hasMovedOn = true;
    // A question about ending it may be open: answering it does nothing now.
    revokeEndingQuestion(queryClient, sessionId);

    if (isFinished) {
      replaceSessionWithSummary(navigation, sessionId);

      for (const filters of readsChangedByFinish()) {
        void queryClient.invalidateQueries(filters);
      }

      return;
    }

    const close = async () => {
      // A read in flight was asked before the 404.
      await queryClient.cancelQueries({
        queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
      });

      if (isStillWriteStarter(openFor)) {
        closeDiscardedSession(queryClient, navigation, sessionId, [data]);
      }
    };

    void close();
  }, [
    data,
    discarding,
    finishing,
    isEnding,
    isFinished,
    isGone,
    isOpen,
    navigation,
    queryClient,
    sessionId,
  ]);

  const isPolling = isOpen && !isGone && !isEnding && isAppActive;
  const wasAppActive = useRef(isAppActive);

  // Back in the foreground: a read asked before the app left may be old.
  useEffect(() => {
    const returned = isAppActive && !wasAppActive.current;
    wasAppActive.current = isAppActive;

    if (
      returned &&
      isPolling &&
      isStillWriteStarter(watch.current?.openFor ?? undefined)
    ) {
      void refetch();
    }
  }, [isAppActive, isPolling, refetch]);

  // Counted from the last read, whoever asked for it, so several screens of
  // the session share one request.
  const waitMs = Math.max(POLL_MS, (rateLimitedFor(error) ?? 0) * 1000);
  const pollAt = Math.max(dataUpdatedAt, errorUpdatedAt) + waitMs;

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const poll = () => {
      timer = setTimeout(poll, POLL_MS);

      if (isStillWriteStarter(watch.current?.openFor ?? undefined)) {
        void refetch({ cancelRefetch: false });
      }
    };

    timer = setTimeout(poll, Math.max(0, pollAt - Date.now()));

    return () => clearTimeout(timer);
  }, [isPolling, pollAt, refetch]);
};
