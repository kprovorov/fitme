import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from "expo-apple-authentication";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useWindowDimensions, View } from "react-native";
import { Image } from "~/components/tw";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import {
  type SocialProvider,
  useNativeSocialAuth,
} from "~/hooks/native-social-auth";
import type { useAuthOperation } from "./operation";

type Operation = ReturnType<typeof useAuthOperation>;
export function SocialAuthButtons(props: {
  operation: Operation;
  divider?: boolean;
  providers: SocialProvider[];
}) {
  return props.providers.length ? <AvailableSocialButtons {...props} /> : null;
}
function AvailableSocialButtons({
  operation,
  providers,
  divider,
}: {
  operation: Operation;
  providers: SocialProvider[];
  divider?: boolean;
}) {
  const { t } = useTranslation();
  const start = useNativeSocialAuth();
  const { fontScale } = useWindowDimensions();
  const signInWithApple = useCallback(() => {
    if (!operation.pending) {
      operation.run("apple", (current) => start("apple", current));
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
        <AppleAuthenticationButton
          accessibilityLabel={t("auth.social.apple")}
          accessibilityState={{
            busy: operation.pending === "apple",
            disabled: operation.pending !== null,
          }}
          buttonStyle={AppleAuthenticationButtonStyle.WHITE}
          buttonType={AppleAuthenticationButtonType.CONTINUE}
          cornerRadius={Math.max(25, 25 * fontScale)}
          onPress={signInWithApple}
          style={{
            height: Math.max(50, 50 * fontScale),
            opacity: operation.pending ? 0.5 : 1,
            width: "100%",
          }}
          testID="auth-apple-button"
        />
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
          onPress={signInWithGoogle}
          size="lg"
          testID="auth-google-button"
          variant="secondary"
        >
          <Image
            accessible={false}
            contentFit="contain"
            source={require("~/assets/auth/google.svg")}
            style={{ height: 20, width: 20 }}
          />
          <Text className="text-body-emphasized">
            {t("auth.social.google")}
          </Text>
        </Button>
      ) : null}
      {divider ? (
        <View className="my-sm flex-row items-center gap-sm">
          <Separator className="flex-1" />
          <Text className="text-footnote text-muted-foreground">
            {t("auth.or")}
          </Text>
          <Separator className="flex-1" />
        </View>
      ) : null}
    </View>
  );
}
