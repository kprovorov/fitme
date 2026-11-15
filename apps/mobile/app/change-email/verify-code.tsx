import { Redirect, useLocalSearchParams } from "expo-router";

import { parseVerificationIntent } from "~/components/auth/verification";
import { ChangeEmailHeader } from "~/components/change-email-header";
import VerifyCodeView from "~/components/views/verify-code-view";

/** The shared code screen for Change Email (`purpose=change-email`). */
const ChangeEmailCodeScreen = () => {
  const params = useLocalSearchParams<{
    emailAddressId: string;
    purpose: string;
  }>();

  const intent = parseVerificationIntent(params);

  if (intent?.purpose !== "change-email") {
    return <Redirect href="/account-security" />;
  }

  return (
    <>
      <ChangeEmailHeader />
      <VerifyCodeView
        emailAddressId={intent.emailAddressId}
        key={intent.emailAddressId}
        purpose="change-email"
      />
    </>
  );
};

export default ChangeEmailCodeScreen;
