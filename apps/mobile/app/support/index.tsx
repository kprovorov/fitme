import * as Sentry from "@sentry/react-native";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";

import { ListRow, ListSection } from "~/components/ui/list-row";
import { openUrl } from "~/lib/external-links";
import { i18n } from "~/lib/i18n";
import { showToast } from "~/lib/toast";

// An address, not text: the same in every App language
const SUPPORT_EMAIL = "support@fitmeproject.com";

const SOCIAL_URLS = {
  instagram: "https://www.instagram.com/fitmeprojectcom",
  threads: "https://www.threads.net/@fitmeprojectcom",
  x: "https://x.com/fitmeproject",
} as const;

/**
 * Hands the support address to the mail app; with none that can take a
 * `mailto:`, copies it instead and says so, so the User can paste it
 * wherever they write email.
 */
const emailSupport = (addressCopied: string) =>
  openUrl(`mailto:${SUPPORT_EMAIL}`, {
    onUnopened: async () => {
      try {
        await Clipboard.setStringAsync(SUPPORT_EMAIL);
        showToast(addressCopied);
      } catch (error) {
        Sentry.captureException(error);
      }
    },
  });

const SupportScreen = () => {
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
        className="flex-1"
        contentContainerClassName="gap-sm px-sm pt-2.5 pb-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <ListSection title={t("support.contactSection")}>
          <ListRow
            accessibilityRole="link"
            detail={SUPPORT_EMAIL}
            label={t("support.emailSupport")}
            onPress={() => {
              void emailSupport(t("support.addressCopied"));
            }}
            separator={false}
          />
        </ListSection>
        <ListSection title={t("support.followSection")}>
          <ListRow
            accessibilityRole="link"
            label={t("support.rows.x")}
            onPress={() => {
              void openUrl(SOCIAL_URLS.x);
            }}
            separator={false}
          />
          <ListRow
            accessibilityRole="link"
            label={t("support.rows.instagram")}
            onPress={() => {
              void openUrl(SOCIAL_URLS.instagram);
            }}
          />
          <ListRow
            accessibilityRole="link"
            label={t("support.rows.threads")}
            onPress={() => {
              void openUrl(SOCIAL_URLS.threads);
            }}
          />
        </ListSection>
      </ScrollView>
    </>
  );
};

export default SupportScreen;
