import { Link, Stack } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "~/components/ui/button";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import PlansListView from "~/components/views/plan-list-view";
import { usePlansQuery } from "~/hooks/queries/plans";
import { Plus } from "~/lib/icons/Plus";

export default function PlansScreen() {
  const { refetch, isLoading } = usePlansQuery();

  return (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: "My Plans",
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () => <HeaderBackButton />,
          headerRight: () => (
            <Link asChild href="/planner">
              <Button shape="pill" size="icon-sm" variant="secondary">
                <Plus className="text-foreground" size={16} />
              </Button>
            </Link>
          ),
        }}
      />
      <SafeAreaView className="flex-1">
        <ScrollView
          className="flex-1 p-6"
          refreshControl={
            <RefreshControl onRefresh={refetch} refreshing={isLoading} />
          }
        >
          <PlansListView />
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
