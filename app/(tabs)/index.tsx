import { SafeAreaView, ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Padding } from "~/components/ui/padding";
import { usePlansQuery } from "~/hooks/queries/plans";
import PlannerView from "~/components/views/planner-view";
import PlansListView from "~/components/views/plans-list-view";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";

export default function HomeScreen() {
  const { data: plans, isLoading, error } = usePlansQuery();

  if (isLoading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  return (
    <SafeAreaProvider>
      <SafeAreaView>
        {plans && plans.length > 0 ? (
          <ScrollView>
            <Padding>
              <PlansListView />
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
