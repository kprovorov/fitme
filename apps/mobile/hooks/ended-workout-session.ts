import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useNavigation } from "expo-router";
import type {
  NavigationProp,
  ParamListBase,
} from "expo-router/react-navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** The app's own Finish or Discard has ended it, and shows what comes next. */
  endedHere: boolean;
  hasMovedOn: boolean;
  /** Who was signed in when it was first shown open, `null` while it wasn't. */
  openFor: WriteStarter | null;
  sessionId: string;
}

/**
 * The Workout Sessions each client has moved on from. Several screens of one
 * session may be mounted together (the session screen, an Exercise's, the
 * picker), each watching it: only the first to notice moves, once.
 */
const movedOn = new WeakMap<QueryClient, Set<string>>();

/** Claims moving on from the session, or answers false once a screen has. */
const claimMoveOn = (client: QueryClient, sessionId: string): boolean => {
  const sessions = movedOn.get(client) ?? new Set<string>();

  if (sessions.has(sessionId)) {
    return false;
  }

  sessions.add(sessionId);
  movedOn.set(client, sessions);

  return true;
};

/**
 * How long one screen's read on a return to the foreground stands for the
 * others: the screens of a session mounted together each notice the same
 * return, in the same commit, and the session is read once.
 */
const FOREGROUND_READ_SHARED_MS = 1000;

/** When each client last read a session again on a return to the foreground. */
const foregroundReads = new WeakMap<QueryClient, Map<string, number>>();

/** Claims the read for this return, or answers false once a screen has. */
const claimForegroundRead = (
  client: QueryClient,
  sessionId: string
): boolean => {
  const reads = foregroundReads.get(client) ?? new Map<string, number>();
  const now = Date.now();
  const last = reads.get(sessionId);

  if (last !== undefined && now - last < FOREGROUND_READ_SHARED_MS) {
    return false;
  }

  reads.set(sessionId, now);
  foregroundReads.set(client, reads);

  return true;
};

/** Gives up a claim to move on that ended in nothing. */
const releaseMoveOn = (client: QueryClient, sessionId: string): void => {
  movedOn.get(client)?.delete(sessionId);
};

const startWatch = (sessionId: string): Watch => ({
  endedHere: false,
  hasMovedOn: false,
  openFor: null,
  sessionId,
});

/** Whether the app is in the foreground (under Control Center too). */
const useIsAppActive = (): boolean => {
  const [isActive, setIsActive] = useState(
    () => AppState.currentState !== "background"
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setIsActive(state !== "background")
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

  // The client's own answer, for what runs before the hooks' has rendered.
  const isEndingNow = useCallback(
    () =>
      queryClient.isMutating(finishing) + queryClient.isMutating(discarding) >
      0,
    [discarding, finishing, queryClient]
  );

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

    // Remembered: the cache drops a mutation some time after its screen closes.
    if (
      [finishing, discarding].some(
        (filters) =>
          mutations.findAll({ ...filters, status: "success" }).length > 0
      )
    ) {
      watched.endedHere = true;
    }

    if (
      !(openFor && (isFinished || isGone)) ||
      isEnding ||
      isEndingNow() ||
      watched.endedHere ||
      watched.hasMovedOn ||
      !isStillWriteStarter(openFor)
    ) {
      return;
    }

    watched.hasMovedOn = true;

    if (!claimMoveOn(queryClient, sessionId)) {
      return;
    }

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
      } else {
        // Signed out meanwhile: another screen of the session may still try.
        releaseMoveOn(queryClient, sessionId);
      }
    };

    void close();
  }, [
    data,
    discarding,
    finishing,
    isEnding,
    isEndingNow,
    isFinished,
    isGone,
    isOpen,
    navigation,
    queryClient,
    sessionId,
  ]);

  const isPolling = isOpen && !isGone && !isEnding && isAppActive;
  const wasAppActive = useRef(isAppActive);
  const rateLimitedMs = (rateLimitedFor(error) ?? 0) * 1000;
  const readableAt = errorUpdatedAt + rateLimitedMs;

  // Back in the foreground: a read asked before the app left may be old, so
  // it's cancelled and asked again, by one screen of the session. One still
  // rate limited is the poll's to wait out.
  useEffect(() => {
    const returned = isAppActive && !wasAppActive.current;
    wasAppActive.current = isAppActive;

    if (
      returned &&
      isPolling &&
      !isEndingNow() &&
      (rateLimitedMs === 0 || Date.now() >= readableAt) &&
      isStillWriteStarter(watch.current?.openFor ?? undefined) &&
      claimForegroundRead(queryClient, sessionId)
    ) {
      void refetch();
    }
  }, [
    isAppActive,
    isEndingNow,
    isPolling,
    queryClient,
    rateLimitedMs,
    readableAt,
    refetch,
    sessionId,
  ]);

  // Counted from the last read, whoever asked for it, so several screens of
  // the session share one request.
  const pollAt =
    Math.max(dataUpdatedAt, errorUpdatedAt) + Math.max(POLL_MS, rateLimitedMs);

  useEffect(() => {
    if (!isPolling) {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const poll = () => {
      timer = setTimeout(poll, POLL_MS);

      if (
        !isEndingNow() &&
        isStillWriteStarter(watch.current?.openFor ?? undefined)
      ) {
        void refetch({ cancelRefetch: false });
      }
    };

    timer = setTimeout(poll, Math.max(0, pollAt - Date.now()));

    return () => clearTimeout(timer);
  }, [isEndingNow, isPolling, pollAt, refetch]);
};
