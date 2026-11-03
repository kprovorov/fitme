import type { PlanWorkout } from "~/hooks/queries/plans";
import { VStack } from "../ui/vstack";
import WorkoutCard from "./workout-card";

interface WorkoutListProps {
  planId: string;
  /** In rotation order, as the Plan's read answers them. */
  workouts: PlanWorkout[];
}

export default function WorkoutList({ planId, workouts }: WorkoutListProps) {
  return (
    <VStack className="flex-1 items-stretch gap-sm">
      {workouts.map((workout) => (
        <WorkoutCard key={workout.id} planId={planId} workout={workout} />
      ))}
    </VStack>
  );
}
