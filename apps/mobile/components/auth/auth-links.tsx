import { router } from "expo-router";
import type { Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";

import { Text } from "~/components/ui/text";
import {
  openWebPage,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from "~/lib/external-links";

const openTerms = () => openWebPage(TERMS_URL);
const openPrivacy = () => openWebPage(PRIVACY_POLICY_URL);

export const AuthLegal = ({ disabled }: { disabled?: boolean }) => {
  const { t } = useTranslation();

  return (
    <View className="min-h-11 flex-row flex-wrap content-center items-center justify-center gap-x-1 py-1">
      <Text className="text-center" variant="muted">
        {t("auth.legal.prefix")}
      </Text>
      <Pressable
        accessibilityRole="link"
        className="justify-center"
        disabled={disabled}
        hitSlop={{ bottom: 13, left: 0, right: 0, top: 13 }}
        onPress={openTerms}
      >
        <Text variant="small">{t("auth.legal.terms")}</Text>
      </Pressable>
      <Text variant="muted">{t("auth.legal.and")}</Text>
      <Pressable
        accessibilityRole="link"
        className="justify-center"
        disabled={disabled}
        hitSlop={{ bottom: 13, left: 0, right: 0, top: 13 }}
        onPress={openPrivacy}
      >
        <Text variant="small">{t("auth.legal.privacy")}.</Text>
      </Pressable>
    </View>
  );
};

export const AuthSwitch = ({
  prompt,
  label,
  href,
  disabled,
  testID,
  onPress,
}: {
  prompt: string;
  label: string;
  href: Href;
  disabled?: boolean;
  testID?: string;
  onPress?: () => void;
}) => (
  <View className="min-h-11 flex-row flex-wrap items-center justify-center gap-x-1">
    <Text variant="muted">{prompt}</Text>
    <Pressable
      accessibilityRole="link"
      className="min-h-11 justify-center"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress ?? (() => router.replace(href))}
      testID={testID}
    >
      <Text variant="small">{label}</Text>
    </Pressable>
  </View>
);
