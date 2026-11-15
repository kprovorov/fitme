import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";

import { AlertDialog } from "~/components/ui/alert-dialog";
import { ListRow, ListSection } from "~/components/ui/list-row";
import { MenuListItem } from "~/components/ui/menu-list";
import { Text } from "~/components/ui/text";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import {
  openWebPage,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from "~/lib/external-links";
import { i18n } from "~/lib/i18n";

const LegalScreen = () => {
  const { mutate: deleteUser } = useDeleteUserMutation();
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

        {/* Stays until Delete Account's only home is Account & Security (FIT-703). */}
        <ListSection>
          <AlertDialog
            actions={[
              { label: t("common.cancel"), role: "cancel" },
              {
                label: t("legal.deleteConfirm.confirm"),
                onPress: () => deleteUser({}),
                role: "destructive",
              },
            ]}
            className="w-full"
            message={t("legal.deleteConfirm.message")}
            title={t("legal.deleteConfirm.title")}
          >
            <MenuListItem>
              <Text>{t("legal.deleteAccount")}</Text>
            </MenuListItem>
          </AlertDialog>
        </ListSection>
      </ScrollView>
    </>
  );
};

export default LegalScreen;
