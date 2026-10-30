import type { Plan, Workout } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import PlanHeader from "../plans/plan-header";
import PlanMenu from "../plans/plan-menu";
import { H3, H4 } from "../ui/typography";
import { VStack } from "../ui/vstack";
import WorkoutCard from "./workout-card";

interface HomeViewProps {
  plan: Plan;
}

export default function HomeView({ plan }: HomeViewProps) {
  const { t } = useTranslation();
  // A copy: plan.workouts is the query cache's array, so it's never sorted in place.
  const rotation = [...plan.workouts].sort((a, b) => a.order - b.order);
  const nextWorkout: Workout | undefined = rotation[0];
  const upcomingWorkouts = rotation.slice(1);

  return (
    <VStack className="items-stretch gap-lg">
      <PlanHeader plan={plan} />
      <View className="flex-row items-center gap-sm">
        <H3 className="flex-1">{t("home.workouts")}</H3>
        <PlanMenu />
      </View>
      <VStack className="items-stretch">
        <H4>{t("home.nextWorkout")}</H4>
        {nextWorkout ? (
          <WorkoutCard state="upcoming" workout={nextWorkout} />
        ) : (
          <H3 className="text-center text-primary">{t("home.allSet")}</H3>
        )}
      </VStack>
      {upcomingWorkouts.length > 0 && (
        <VStack className="items-stretch">
          <H4>{t("home.upcoming")}</H4>
          {upcomingWorkouts.map((workout) => (
            <WorkoutCard key={workout.id} state="default" workout={workout} />
          ))}
        </VStack>
      )}
    </VStack>
  );
}
