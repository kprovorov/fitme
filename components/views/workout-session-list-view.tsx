import { Link } from "expo-router";
import type { WorkoutSession } from "~/lib/models";
import { H3 } from "../ui/typography";
import { VStack } from "../ui/vstack";
import WorkoutSessionCard from "./workout-session-card";

interface WorkoutsSessionsListViewProps {
  workoutsSessions: WorkoutSession[];
}

export default function WorkoutsSessionsListView({
  workoutsSessions,
}: WorkoutsSessionsListViewProps) {
  return (
    <VStack className="items-stretch">
      {workoutsSessions.length ? (
        workoutsSessions.map((workoutSession) => (
          <Link
            href={`/plans/${workoutSession.workout.plan.id}/workouts/${workoutSession.workout.id}/sessions/${workoutSession.id}`}
            key={workoutSession.id}
          >
            <WorkoutSessionCard workoutSession={workoutSession} />
          </Link>
        ))
      ) : (
        <H3 className="text-center">Nothing here yet</H3>
      )}
    </VStack>
  );
}
