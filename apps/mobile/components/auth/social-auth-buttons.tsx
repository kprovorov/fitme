import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from "expo-apple-authentication";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions, View } from "react-native";
import { ScopedVariables, withUniwind } from "uniwind";

import { Image } from "~/components/image";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { useNativeSocialAuth } from "~/hooks/native-social-auth";
import type { SocialProvider } from "~/hooks/native-social-auth";

import type { useAuthOperation } from "./operation";

type Operation = ReturnType<typeof useAuthOperation>;

// SAFETY: Metro resolves this static asset to its numeric asset registry id.
// oxlint-disable-next-line unicorn/prefer-module, node/global-require -- Metro requires a static asset require.
const googleLogo = require("~/assets/auth/google.svg") as number;

const StyledAppleAuthenticationButton = withUniwind(AppleAuthenticationButton);

const AvailableSocialButtons = ({
  operation,
  providers,
  divider,
}: {
  operation: Operation;
  providers: SocialProvider[];
  divider?: boolean;
}) => {
  const { t } = useTranslation();
  const start = useNativeSocialAuth();
  const { fontScale } = useWindowDimensions();

  const signInWithApple = useCallback(() => {
    if (!operation.pending) {
      void operation.run("apple", (current) => start("apple", current));
    }
  }, [operation, start]);

  const signInWithGoogle = useCallback(
    () => operation.run("google", (current) => start("google", current)),
    [operation, start]
  );

  const apple = providers.includes("apple");
  const google = providers.includes("google");

  if (!(apple || google)) {
    return null;
  }

  return (
    <View className="gap-xs">
      {apple ? (
        <ScopedVariables
          variables={{ "--apple-button-height": Math.max(50, 50 * fontScale) }}
        >
          <StyledAppleAuthenticationButton
            accessibilityLabel={t("auth.social.apple")}
            accessibilityState={{
              busy: operation.pending === "apple",
              disabled: operation.pending !== null,
            }}
            buttonStyle={AppleAuthenticationButtonStyle.WHITE}
            buttonType={AppleAuthenticationButtonType.CONTINUE}
            className={`h-(--apple-button-height) w-full ${operation.pending ? "opacity-50" : "opacity-100"}`}
            cornerRadius={Math.max(25, 25 * fontScale)}
            onPress={signInWithApple}
            testID="auth-apple-button"
          />
        </ScopedVariables>
      ) : null}
      {google ? (
        <Button
          accessibilityLabel={t(
            operation.pending === "google"
              ? "auth.social.connectingGoogle"
              : "auth.social.google"
          )}
          disabled={operation.pending !== null}
          fill
          isLoading={operation.pending === "google"}
          onPress={(...args) => {
            void signInWithGoogle(...args);
          }}
          size="lg"
          testID="auth-google-button"
          variant="secondary"
        >
          <Image
            accessible={false}
            className="size-5"
            contentFit="contain"
            source={googleLogo}
          />
          <Text variant="large">{t("auth.social.google")}</Text>
        </Button>
      ) : null}
      {divider ? (
        <View className="mt-xs gap-sm flex-row items-center">
          <Separator className="flex-1" />
          <Text variant="muted">{t("auth.or")}</Text>
          <Separator className="flex-1" />
        </View>
      ) : null}
    </View>
  );
};

export const SocialAuthButtons = (props: {
  operation: Operation;
  divider?: boolean;
  providers: SocialProvider[];
}) => (props.providers.length ? <AvailableSocialButtons {...props} /> : null);
