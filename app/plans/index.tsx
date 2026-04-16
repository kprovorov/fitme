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
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "My Plans",
          headerBackButtonDisplayMode: "minimal",
          unstable_headerRightItems: () => [
            {
              label: "Create workout plan",
              type: "button",
              icon: {
                type: "sfSymbol",
                name: "plus",
              },
              onPress: () => {
                router.push("/planner");
              },
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
