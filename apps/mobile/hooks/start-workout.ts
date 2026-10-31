import type { Plan, Workout } from "@fitme/core";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import {
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  type OpenWorkoutSession,
  useCreateWorkoutSessionMutation,
  useOpenWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import { ApiError, rateLimitedFor } from "~/lib/api/client";
import { i18n } from "~/lib/i18n";

/** The Workout Session screen of a Workout of a Plan. */
export const workoutSessionPath = (
  planId: string,
  workoutId: string,
  sessionId: string
) => `/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}` as const;

/**
 * The screen of the User's open Workout Session: under its Workout, or on its
 * own once the Workout is gone.
 */
export const openSessionPath = ({
  id,
  planId,
  workoutId,
}: OpenWorkoutSession) =>
  planId && workoutId
    ? workoutSessionPath(planId, workoutId, id)
    : (`/workout-sessions/${id}` as const);

/**
 * The Plan's next Workout: the first of its rotation (finishing one moves it
 * to the end), if it has any.
 */
export const nextWorkoutOf = (plan: Plan): Workout | undefined =>
  // A copy: plan.workouts is the query cache's array, never sorted in place.
  [...plan.workouts].sort((a, b) => a.order - b.order)[0];

/** The Workout's own open Workout Session, if it has one. */
export const findOpenSession = (workout: Workout) =>
  workout.sessions.find(
    (session) => session.started_at && !session.finished_at
  );

const alertStartFailed = (waitSeconds: number | null) => {
  Alert.alert(
    i18n.t("startWorkout.failed.title"),
    waitSeconds === null
      ? i18n.t("startWorkout.failed.network")
      : i18n.t("startWorkout.failed.rateLimited", { seconds: waitSeconds })
  );
};

/** "Finish <Workout> first": another Workout's session is open. */
const alertFinishFirst = (open: OpenWorkoutSession) => {
  Alert.alert(
    i18n.t("startWorkout.failed.title"),
    open.workoutName
      ? i18n.t("startWorkout.finishFirstNamed", { name: open.workoutName })
      : i18n.t("startWorkout.finishFirst")
  );
};

const isSessionInProgress = (error: unknown) =>
  error instanceof ApiError && error.code === "session_in_progress";

/**
 * Starts a Workout (or resumes its open Workout Session) through the Public
 * API, the way the Workout tab's cards and the Workout screen both do: the Workout,
 * Plan and open Workout Session reads are invalidated, then `onStarted`
 * opens the session. A failure is the "Couldn't start workout" alert (the
 * wait on a 429), except a 409 `session_in_progress` (another Workout's
 * session opened meanwhile), which re-reads the open Workout Session so
 * `blockedBy` shows it instead (still the alert if the re-read shows none).
 *
 * `blockedBy` is another Workout's open Workout Session, which Start waits
 * on (a User has at most one, ADR 0013); `null` while it's unknown, so a
 * failed read never blocks: the API still refuses.
 *
 * `alertsInProgress` is for a Start that stays pressable while blocked (the
 * Workout tab's cards, whose open session's own card reads Continue): it
 * still asks the API, and the 409 alerts "Finish <Workout> first".
 */
export function useStartWorkout(
  workoutId: string,
  onStarted: (sessionId: string) => void,
  { alertsInProgress = false }: { alertsInProgress?: boolean } = {}
) {
  const queryClient = useQueryClient();
  const { data: openSession } = useOpenWorkoutSessionQuery();
  const { mutate, isPending } = useCreateWorkoutSessionMutation({
    onError: async (error) => {
      if (isSessionInProgress(error)) {
        await queryClient.invalidateQueries({
          queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
        });
        const open = queryClient.getQueryData<OpenWorkoutSession | null>(
          OPEN_WORKOUT_SESSION_QUERY_KEY
        );
        // The blocked state shows it; otherwise (finished meanwhile, or the
        // re-read failed) the press still gets an answer.
        if (open && open.workoutId !== workoutId) {
          if (alertsInProgress) {
            alertFinishFirst(open);
          }
          return;
        }
      }
      alertStartFailed(rateLimitedFor(error));
    },
    onSuccess: (workoutSession) => {
      queryClient.invalidateQueries({ queryKey: ["workout"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({
        queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
      });
      onStarted(workoutSession.id);
    },
  });

  const blockedBy =
    openSession && openSession.workoutId !== workoutId ? openSession : null;
  return {
    blockedBy,
    isStarting: isPending,
    startWorkout: () => mutate({ workoutId }),
  };
}
