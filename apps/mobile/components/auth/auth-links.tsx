import { type Href, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Linking, Pressable, View } from "react-native";
import { Text } from "~/components/ui/text";

const TERMS_URL = "https://fitmeproject.com/terms";
const PRIVACY_URL = "https://fitmeproject.com/privacy-policy";
const openTerms = () => {
  Linking.openURL(TERMS_URL);
};
const openPrivacy = () => {
  Linking.openURL(PRIVACY_URL);
};
export function AuthLegal({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <View className="min-h-11 flex-row flex-wrap content-center items-center justify-center gap-x-1 py-3.5">
      <Text className="text-center text-footnote text-muted-foreground">
        {t("auth.legal.prefix")}
      </Text>
      <Pressable
        accessibilityRole="link"
        className="justify-center"
        disabled={disabled}
        hitSlop={{ bottom: 13, left: 0, right: 0, top: 13 }}
        onPress={openTerms}
      >
        <Text className="text-footnote underline">{t("auth.legal.terms")}</Text>
      </Pressable>
      <Text className="text-footnote text-muted-foreground">
        {t("auth.legal.and")}
      </Text>
      <Pressable
        accessibilityRole="link"
        className="justify-center"
        disabled={disabled}
        hitSlop={{ bottom: 13, left: 0, right: 0, top: 13 }}
        onPress={openPrivacy}
      >
        <Text className="text-footnote underline">
          {t("auth.legal.privacy")}.
        </Text>
      </Pressable>
    </View>
  );
}
export function AuthSwitch({
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
}) {
  return (
    <View className="min-h-11 flex-row flex-wrap items-center justify-center gap-x-1">
      <Text className="text-footnote text-muted-foreground">{prompt}</Text>
      <Pressable
        accessibilityRole="link"
        className="min-h-11 justify-center"
        disabled={disabled}
        hitSlop={8}
        onPress={onPress ?? (() => router.replace(href))}
        testID={testID}
      >
        <Text className="text-footnote-emphasized text-primary">{label}</Text>
      </Pressable>
    </View>
  );
}
