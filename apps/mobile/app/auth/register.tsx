import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import RegisterView from "~/components/views/register-view";

export default function Screen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("auth.register.title") }} />
      <RegisterView />
    </>
  );
}
