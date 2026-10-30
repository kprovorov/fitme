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
      <VStack className="items-stretch gap-sm">
        {/* Wraps at large text sizes, so the heading keeps whole words and
            the sliders button drops under it. */}
        <View className="flex-row flex-wrap items-center">
          <H3 className="shrink">{t("home.workouts")}</H3>
          <View className="ml-auto">
            <PlanMenu />
          </View>
        </View>
        <VStack className="items-stretch">
          <H4>{t("home.nextWorkout")}</H4>
          {nextWorkout ? (
            <WorkoutCard state="upcoming" workout={nextWorkout} />
          ) : (
            <H3 className="text-center text-primary">{t("home.allSet")}</H3>
          )}
        </VStack>
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
