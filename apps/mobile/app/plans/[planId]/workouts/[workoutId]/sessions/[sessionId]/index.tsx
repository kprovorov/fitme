import { useLocalSearchParams } from "expo-router";
import WorkoutSessionScreen from "~/components/workout-sessions/workout-session-screen";

export default function PlanWorkoutSessionRoute() {
  const { sessionId } = useLocalSearchParams();
  return <WorkoutSessionScreen sessionId={sessionId as string} />;
}
