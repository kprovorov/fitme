import { useLocalSearchParams } from "expo-router";

import WorkoutSessionScreen from "~/components/workout-sessions/workout-session-screen";

const PlanWorkoutSessionRoute = () => {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();

  return <WorkoutSessionScreen sessionId={sessionId} />;
};

export default PlanWorkoutSessionRoute;
