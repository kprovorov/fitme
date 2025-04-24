import React from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Link, Stack } from "expo-router";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { RefreshControl, ScrollView } from "react-native";
import PlansListView from "~/components/views/plan-list-view";
import { usePlansQuery } from "~/hooks/queries/plans";
import { Button } from "~/components/ui/button";
import { Plus } from "~/lib/icons/Plus";
import { Text } from "~/components/ui/text";

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
            <Link href="/onboarding/plan" asChild>
              <Button variant="secondary" size="icon-sm" shape="pill">
                <Text>
                  <Plus size={16} className="text-foreground" />
                </Text>
              </Button>
            </Link>
          ),
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView
            className="flex-1 p-6"
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={refetch} />
            }
          >
            <PlansListView />
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
