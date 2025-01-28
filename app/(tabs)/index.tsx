import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { useWorkoutPlansQuery } from "~/hooks/queries/workout-plans";
import PlannerView from "~/components/views/planner-view";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import WorkoutPlansListView from "~/components/views/workout-plans-list-view";
import { H3 } from "~/components/ui/typography";
import WorkoutsListView from "~/components/views/workouts-list-view";

export default function HomeScreen() {
  const { data: plans, isLoading, error } = useWorkoutPlansQuery();

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <SafeAreaProvider>
      <SafeAreaView>
        {plans && plans.length > 0 ? (
          <ScrollView>
            <Padding>
              <VStack className="items-stretch">
                <H3>My Plan</H3>
                <WorkoutPlansListView filter={(plan) => plan.is_active} />
                <H3>Workouts</H3>
                {plans.find((plan) => plan.is_active) && (
                  <WorkoutsListView
                    planId={plans.find((plan) => plan.is_active)!.id}
                  />
                )}
              </VStack>
            </Padding>
          </ScrollView>
        ) : (
          <VStack className="h-full p-4">
            <PlannerView />
          </VStack>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
