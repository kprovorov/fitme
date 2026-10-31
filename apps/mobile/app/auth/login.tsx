import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import LoginView from "~/components/views/login-view";

export default function Screen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("auth.login.title") }} />
      <LoginView />
    </>
  );
}
