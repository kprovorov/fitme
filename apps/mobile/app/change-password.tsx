import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import ChangePasswordView from "~/components/profile/change-password-view";

// Pushed from Account & Security's Change Password row, with the same
// floating header as the Screen it came from.
const ChangePasswordScreen = () => {
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
          title: t("changePassword.title"),
        }}
      />
      <ChangePasswordView />
    </>
  );
};

export default ChangePasswordScreen;
