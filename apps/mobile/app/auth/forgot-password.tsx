import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import ForgotPasswordView from "~/components/views/forgot-password-view";

const Screen = () => {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t("forgotPassword.title") }} />
      <ForgotPasswordView />
    </>
  );
};

export default Screen;
