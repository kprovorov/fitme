import { Stack, useRouter } from "expo-router";
import { useCallback } from "react";
import { RefreshControl, ScrollView } from "react-native";
import PlansListView from "~/components/views/plan-list-view";
import { usePlansQuery } from "~/hooks/queries/plans";

export default function PlansScreen() {
  const { refetch, isLoading } = usePlansQuery();
  const router = useRouter();
  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

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
          <RefreshControl onRefresh={onRefresh} refreshing={isLoading} />
        }
      >
        <PlansListView />
      </ScrollView>
    </>
  );
}
