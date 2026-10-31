import type { Plan } from "@fitme/core";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import PlanHeader from "../plans/plan-header";
import PlanMenu from "../plans/plan-menu";
import { H3 } from "../ui/typography";
import { VStack } from "../ui/vstack";
import WorkoutCarousel from "../workouts/workout-carousel";

interface HomeViewProps {
  plan: Plan;
}

export default function HomeView({ plan }: HomeViewProps) {
  const { t } = useTranslation();

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
        {plan.workouts.length > 0 ? (
          <WorkoutCarousel plan={plan} />
        ) : (
          <H3 className="text-center text-primary">{t("home.allSet")}</H3>
        )}
      </VStack>
    </VStack>
  );
}
