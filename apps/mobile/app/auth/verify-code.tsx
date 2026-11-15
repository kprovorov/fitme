import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { parseVerificationIntent } from "~/components/auth/verification";
import VerifyCodeView from "~/components/views/verify-code-view";

const VerifyCodeScreen = () => {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ purpose: string; source?: string }>();
  const intent = parseVerificationIntent(params);

  // Changing an email is a signed-in User's, on its own route.
  if (!intent || intent.purpose === "change-email") {
    return <Redirect href="/auth" />;
  }

  return (
    <>
      <Stack.Screen options={{ title: t("verifyCode.screenTitle") }} />
      <VerifyCodeView
        key={`${intent.purpose}-${"source" in intent ? intent.source : ""}`}
        {...intent}
      />
    </>
  );
};

export default VerifyCodeScreen;
