import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";

import SubscriptionView from "~/components/profile/subscription-view";

// Pushed from the redesigned Profile's Account list.
const SubscriptionScreen = () => {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("subscription.title"),
        }}
      />
      <ScrollView
        className="px-sm"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <SubscriptionView />
      </ScrollView>
    </>
  );
};

export default SubscriptionScreen;
