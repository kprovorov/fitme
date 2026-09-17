import { Stack, useRouter } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
import PlansListView from "~/components/views/plan-list-view";
import { usePlansQuery } from "~/hooks/queries/plans";

export default function PlansScreen() {
  const { refetch, isLoading } = usePlansQuery();
  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: "My Plans",
          unstable_headerRightItems: () => [
            {
              icon: {
                name: "plus",
                type: "sfSymbol",
              },
              label: "Create workout plan",
              onPress: () => {
                router.push("/planner");
              },
              type: "button",
            },
          ],
        }}
      />

      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl onRefresh={refetch} refreshing={isLoading} />
        }
      >
        <PlansListView />
      </ScrollView>
    </>
  );
}
