import { View } from "react-native";

import type { PlanWorkout } from "~/hooks/queries/plans";

import WorkoutCard from "./workout-card";

interface WorkoutListProps {
  planId: string;
  /** In rotation order, as the Plan's read answers them. */
  workouts: PlanWorkout[];
}

const WorkoutList = ({ planId, workouts }: WorkoutListProps) => (
  <View className="gap-sm flex flex-1 flex-col items-stretch justify-center">
    {workouts.map((workout) => (
      <WorkoutCard key={workout.id} planId={planId} workout={workout} />
    ))}
  </View>
);

export default WorkoutList;
