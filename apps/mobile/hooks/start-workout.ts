import { ApiError, rateLimitedFor } from "@fitme/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

import type { FullPlan, PlanWorkout } from "~/hooks/queries/plans";
import {
  OPEN_WORKOUT_SESSION_QUERY_KEY,
  seedWorkoutSession,
  useCreateWorkoutSessionMutation,
  useOpenWorkoutSessionQuery,
} from "~/hooks/queries/workout-sessions";
import type { OpenWorkoutSession } from "~/hooks/queries/workout-sessions";
import { analytics, workoutSessionProperties } from "~/lib/analytics";
import { i18n } from "~/lib/i18n";
import { isStillWriteStarter } from "~/lib/write-answers";

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
export const openSessionPath = ({ id, plan, workout }: OpenWorkoutSession) =>
  plan && workout
    ? workoutSessionPath(plan.id, workout.id, id)
    : (`/workout-sessions/${id}` as const);

/**
 * The Plan's next Workout: the first of its rotation (finishing one moves it
 * to the end), if it has any.
 */
export const nextWorkoutOf = <W extends { order: number }>(plan: {
  workouts: W[];
}): W | undefined =>
  // A copy: plan.workouts is the query cache's array, never sorted in place.
  plan.workouts.toSorted((a, b) => a.order - b.order)[0];

/**
 * What a User with no finished Workout Session does next (History's empty
 * card, Profile's New user state): resume the open Workout Session first (a
 * User has at most one, ADR 0013, with or without an active Plan), else start
 * the active Plan's next Workout, else create a Plan. An active Plan with no
 * Workout has nothing to start, so it's Create a Plan too.
 */
export type NextStep =
  | { kind: "createPlan" }
  | { kind: "resume"; openSession: OpenWorkoutSession }
  | { kind: "start"; plan: FullPlan; workout: PlanWorkout };

/**
 * The next step, from the open Workout Session and the active Plan as their
 * reads answered them (`null` for none: both read, never guessed).
 */
export const nextStepOf = (
  activePlan: FullPlan | null,
  openSession: OpenWorkoutSession | null
): NextStep => {
  if (openSession) {
    return { kind: "resume", openSession };
  }

  const workout = activePlan ? nextWorkoutOf(activePlan) : undefined;

  return activePlan && workout
    ? { kind: "start", plan: activePlan, workout }
    : { kind: "createPlan" };
};

const alertStartFailed = (waitSeconds: number | null) => {
  Alert.alert(
    i18n.t("startWorkout.failed.title"),
    waitSeconds === null
      ? i18n.t("startWorkout.failed.network")
      : i18n.t("startWorkout.failed.rateLimited", { seconds: waitSeconds })
  );
};

/** "Finish or discard <Workout> first", with a way into that Workout Session. */
const alertFinishOrDiscardFirst = (
  open: OpenWorkoutSession,
  onContinue: (open: OpenWorkoutSession) => void
) => {
  const name = open.workout?.name;
  Alert.alert(
    i18n.t("startWorkout.failed.title"),
    name
      ? i18n.t("startWorkout.finishOrDiscardFirstNamed", { name })
      : i18n.t("startWorkout.finishOrDiscardFirst"),
    [
      { style: "cancel", text: i18n.t("common.cancel") },
      {
        onPress: () => onContinue(open),
        text: name
          ? i18n.t("startWorkout.continueNamed", { name })
          : i18n.t("startWorkout.continue"),
      },
    ]
  );
};

/**
 * Starts a Workout (or resumes its open Workout Session) through the Public
 * API, the way the Workout tab's cards and the Workout screen both do: the
 * answer is shown as the session's read (so its screen opens without reading
 * it again, unless a newer read landed meanwhile), the open Workout Session
 * read is invalidated, then `onStarted` opens the session; all of it only
 * while the User who pressed Start is still signed in. A failure is the "Couldn't start workout" alert (the
 * wait on a 429), except a 409 `session_in_progress` (another Workout's
 * session opened meanwhile), which re-reads the open Workout Session so
 * `blockedBy` shows it instead (still the alert if the re-read shows none).
 *
 * `blockedBy` is another Workout's open Workout Session, which Start waits
 * on (a User has at most one, ADR 0013); `null` while it's unknown, so a
 * failed read never blocks: the API still refuses.
 *
 * `onContinueBlocking` is for a Start that stays pressable while blocked
 * (the Workout tab's cards, whose open session's own card reads Continue):
 * it still asks the API, and the 409 alerts "Finish or discard <Workout>
 * first", its Continue button handing the blocking session to
 * `onContinueBlocking`.
 */
export const useStartWorkout = (
  workoutId: string,
  onStarted: (sessionId: string) => void,
  {
    onContinueBlocking,
  }: { onContinueBlocking?: (open: OpenWorkoutSession) => void } = {}
) => {
  const queryClient = useQueryClient();
  const { data: openSession } = useOpenWorkoutSessionQuery();

  const { mutate, isPending } = useCreateWorkoutSessionMutation({
    // Signed out (or another User signed in) before the answer: it's the
    // previous User's, so it neither shows, nor reads, nor opens anything.
    onError: async (error, _variables, starter) => {
      if (!isStillWriteStarter(starter)) {
        return;
      }

      if (error instanceof ApiError && error.code === "session_in_progress") {
        await queryClient.invalidateQueries({
          queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY,
        });

        if (!isStillWriteStarter(starter)) {
          return;
        }

        const open = queryClient.getQueryData<OpenWorkoutSession | null>(
          OPEN_WORKOUT_SESSION_QUERY_KEY
        );

        // The blocked state shows it; otherwise (finished meanwhile, or the
        // re-read failed) the press still gets an answer.
        if (open && open.workout?.id !== workoutId) {
          if (onContinueBlocking) {
            alertFinishOrDiscardFirst(open, onContinueBlocking);
          }

          return;
        }
      }

      alertStartFailed(rateLimitedFor(error));
    },
    onSuccess: async (
      { isNew, session: workoutSession },
      _variables,
      starter
    ) => {
      // Only a new one, and only for the User who started it.
      if (isNew && isStillWriteStarter(starter)) {
        void analytics.send(
          "Workout Started",
          workoutSessionProperties(workoutSession)
        );
      }

      // Shown, or read again when a newer read landed meanwhile: either way
      // it opens. Signed out meanwhile, it was the previous User's.
      const seeded = await seedWorkoutSession(
        queryClient,
        starter,
        workoutSession,
        [{ queryKey: OPEN_WORKOUT_SESSION_QUERY_KEY }]
      );

      if (seeded === "signed-out") {
        return;
      }

      onStarted(workoutSession.id);
    },
  });

  const blockedBy =
    openSession && openSession.workout?.id !== workoutId ? openSession : null;

  return {
    blockedBy,
    isStarting: isPending,
    startWorkout: () => mutate({ workoutId }),
  };
};
