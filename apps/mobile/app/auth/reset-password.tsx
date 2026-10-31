import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import ResetPasswordView from "~/components/views/reset-password-view";

export default function Screen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("resetPassword.title") }} />
      <ResetPasswordView />
    </>
  );
}
