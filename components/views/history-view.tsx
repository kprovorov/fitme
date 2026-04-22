import { Link } from "expo-router";
import type { WorkoutSession } from "~/lib/models";
import { VStack } from "../ui/vstack";
import WorkoutSessionCard from "./workout-session-card";

interface WorkoutsSessionsListViewProps {
  workoutsSessions: WorkoutSession[];
}

export default function HistoryView({
  workoutsSessions,
}: WorkoutsSessionsListViewProps) {
  return (
    <VStack className="items-stretch justify-start">
      {workoutsSessions.map((workoutSession) => (
        <Link
          href={`/workout-sessions/${workoutSession.id}`}
          key={workoutSession.id}
        >
          <WorkoutSessionCard
            className="w-full"
            workoutSession={workoutSession}
          />
        </Link>
      ))}
    </VStack>
  );
}
