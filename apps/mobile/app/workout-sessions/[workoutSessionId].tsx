import { useLocalSearchParams } from "expo-router";

import WorkoutSessionScreen from "~/components/workout-sessions/workout-session-screen";

const WorkoutSessionRoute = () => {
  const { workoutSessionId } = useLocalSearchParams<{
    workoutSessionId: string;
  }>();

  return <WorkoutSessionScreen sessionId={workoutSessionId} />;
};

export default WorkoutSessionRoute;
