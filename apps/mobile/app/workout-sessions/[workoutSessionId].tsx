import { useLocalSearchParams } from "expo-router";
import WorkoutSessionScreen from "~/components/workout-sessions/workout-session-screen";

export default function WorkoutSessionRoute() {
  const { workoutSessionId } = useLocalSearchParams();
  return <WorkoutSessionScreen sessionId={workoutSessionId as string} />;
}
