import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";

import { ListRow, ListSection } from "~/components/ui/list-row";
import {
  openWebPage,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from "~/lib/external-links";
import { i18n } from "~/lib/i18n";

const LegalScreen = () => {
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
          title: t("legal.privacyTitle"),
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-sm px-sm pt-2.5 pb-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <ListSection>
          <ListRow
            accessibilityRole="link"
            label={t("legal.privacyPolicy")}
            onPress={() => {
              void openWebPage(PRIVACY_POLICY_URL);
            }}
            separator={false}
          />
          <ListRow
            accessibilityRole="link"
            label={t("legal.terms")}
            onPress={() => {
              void openWebPage(TERMS_URL);
            }}
          />
        </ListSection>
      </ScrollView>
    </>
  );
};

export default LegalScreen;
