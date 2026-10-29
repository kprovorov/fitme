import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useCreateWorkoutSessionMutation } from "~/hooks/queries/workout-sessions";
import { rateLimitedFor } from "~/lib/api/client";

/** The Workout Session screen of a Workout of a Plan. */
export const workoutSessionPath = (
  planId: string,
  workoutId: string,
  sessionId: string
) => `/plans/${planId}/workouts/${workoutId}/sessions/${sessionId}` as const;

/**
 * Starts a Workout (or resumes its open Workout Session) through the Public
 * API, the way the Home card and the Workout screen both do: the Workout and
 * Plan reads are invalidated, then `onStarted` opens the session. A failure
 * is the "Couldn't start workout" alert (the wait on a 429).
 */
export function useStartWorkout(
  workoutId: string,
  onStarted: (sessionId: string) => void
) {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useCreateWorkoutSessionMutation({
    onError: (error) => {
      const waitSeconds = rateLimitedFor(error);
      Alert.alert(
        "Couldn't start workout",
        waitSeconds === null
          ? "Check your connection and try again."
          : `Too many requests: please try again in ${waitSeconds} s.`
      );
    },
    onSuccess: (workoutSession) => {
      queryClient.invalidateQueries({ queryKey: ["workout"] });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      onStarted(workoutSession.id);
    },
  });

  return {
    isStarting: isPending,
    startWorkout: () => mutate({ workoutId }),
  };
}
