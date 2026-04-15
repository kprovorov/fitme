import type { Workout } from "~/lib/models";
import { VStack } from "../ui/vstack";
import WorkoutCard from "./workout-card";

interface WorkoutListProps {
  workouts: Workout[];
}

export default function WorkoutList({ workouts }: WorkoutListProps) {
  return (
    <VStack className="flex-1 items-stretch gap-sm">
      {workouts.map((workout) => (
        <WorkoutCard key={workout.id} workout={workout} />
      ))}
    </VStack>
  );
}
