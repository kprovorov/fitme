import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useCSSVariable } from "uniwind";

import Instagram from "~/components/icons/social/instagram";
import Threads from "~/components/icons/social/threads";
import X from "~/components/icons/social/x";
import { Button } from "~/components/ui/button";
import { P } from "~/components/ui/typography";
import { openUrl } from "~/lib/external-links";
import { i18n } from "~/lib/i18n";

/**
 * A 16 pt logo in a 44 pt-wide tap target (the ghost Button gives the
 * height), aligned with the text above it.
 */
const LOGO_TARGET_CLASS = "w-11 items-start";

// An address, not text: the same in every App language
const SUPPORT_EMAIL = "support@fitmeproject.com";

const openSupportEmail = () => openUrl(`mailto:${SUPPORT_EMAIL}`);
const openX = () => openUrl("https://x.com/fitmeproject");

const openInstagram = () =>
  openUrl("https://www.instagram.com/fitmeprojectcom");

const openThreads = () => openUrl("https://www.threads.net/@fitmeprojectcom");

const SupportScreen = () => {
  // SAFETY: The shared tokens define --color-primary as a color string in every theme.
  const primary = useCSSVariable("--color-primary") as string;
  const { t } = useTranslation(undefined, { i18n });

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("support.title"),
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex flex-col items-start justify-center">
          <P>{t("support.contact")}</P>
          <Button
            label={SUPPORT_EMAIL}
            onPress={(...args) => {
              void openSupportEmail(...args);
            }}
            variant="ghost"
          />
          <View className="flex flex-row items-center justify-center">
            <Button
              accessibilityLabel={t("support.social.x")}
              onPress={(...args) => {
                void openX(...args);
              }}
              variant="ghost"
            >
              <View className={LOGO_TARGET_CLASS}>
                <X fill={primary} height={16} width={16} />
              </View>
            </Button>
            <Button
              accessibilityLabel={t("support.social.instagram")}
              onPress={(...args) => {
                void openInstagram(...args);
              }}
              variant="ghost"
            >
              <View className={LOGO_TARGET_CLASS}>
                <Instagram fill={primary} height={16} width={16} />
              </View>
            </Button>
            <Button
              accessibilityLabel={t("support.social.threads")}
              onPress={(...args) => {
                void openThreads(...args);
              }}
              variant="ghost"
            >
              <View className={LOGO_TARGET_CLASS}>
                <Threads fill={primary} height={16} width={16} />
              </View>
            </Button>
          </View>
        </View>
      </ScrollView>
    </>
  );
};

export default SupportScreen;
