import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { AuthHeader } from "~/components/auth/auth-header";
import { AuthLegal, AuthSwitch } from "~/components/auth/auth-links";
import { AuthScreen } from "~/components/auth/auth-screen";
import { useAuthOperation } from "~/components/auth/operation";
import { SocialAuthButtons } from "~/components/auth/social-auth-buttons";
import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { useAvailableSocialProviders } from "~/hooks/native-social-auth";

const FEATURES = [
  { icon: "bolt.fill", key: "auth.intro.plans" },
  { icon: "checkmark", key: "auth.intro.logging" },
  { icon: "play.circle.fill", key: "auth.intro.guides" },
] as const;
export default function AuthWelcomeView() {
  const goToLogin = () => router.push("/auth/login");
  const continueWithEmail = () => router.push("/auth/register");
  const { t } = useTranslation();
  const operation = useAuthOperation();
  const busy = operation.pending !== null;
  const providers = useAvailableSocialProviders();
  const hasSocial = providers.length > 0;
  return (
    <AuthScreen
      action={
        <View className="gap-xs">
          {operation.error ? (
            <ErrorMessage>{operation.error}</ErrorMessage>
          ) : null}
          <SocialAuthButtons operation={operation} providers={providers} />
          <Button
            disabled={busy}
            fill
            label={t("auth.intro.email")}
            onPress={continueWithEmail}
            size="lg"
            testID="continue-email-button"
            variant={hasSocial ? "ghost" : "default"}
          />
        </View>
      }
      footer={
        <>
          <AuthSwitch
            disabled={busy}
            href="/auth/login"
            label={t("auth.register.loginLink")}
            onPress={goToLogin}
            prompt={t("auth.register.haveAccount")}
            testID="login-here-link"
          />
          <AuthLegal disabled={busy} />
        </>
      }
      welcome
    >
      <AuthHeader
        description={t("auth.intro.description")}
        title={t("auth.intro.heading")}
        welcome
      />
      <View className="gap-sm">
        {FEATURES.map((feature) => (
          <View className="flex-row items-center gap-sm" key={feature.key}>
            <View className="size-11 items-center justify-center rounded-full bg-secondary">
              <SymbolImage
                className="text-body text-primary"
                name={feature.icon}
              />
            </View>
            <Text className="flex-1 text-body-emphasized">
              {t(feature.key)}
            </Text>
          </View>
        ))}
      </View>
    </AuthScreen>
  );
}
