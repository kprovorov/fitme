import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";

import AccountSecurityView from "~/components/profile/account-security-view";

// Pushed from the redesigned Profile's Account list.
const AccountSecurityScreen = () => {
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
          title: t("accountSecurity.title"),
        }}
      />
      <ScrollView
        className="px-sm"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <AccountSecurityView />
      </ScrollView>
    </>
  );
};

export default AccountSecurityScreen;
