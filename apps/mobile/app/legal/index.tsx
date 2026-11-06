import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView } from "react-native";

import { SymbolImage } from "~/components/symbol-image";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text, TextClassContext } from "~/components/ui/text";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import {
  openWebPage,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from "~/lib/external-links";
import { i18n } from "~/lib/i18n";

const openPrivacy = () => openWebPage(PRIVACY_POLICY_URL);
const openTerms = () => openWebPage(TERMS_URL);

const LegalLink = ({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) => (
  <TextClassContext.Provider value="web:pointer-events-none">
    <Pressable
      accessibilityRole="link"
      className="active:bg-accent flex-1 flex-row items-center justify-between gap-2 p-4"
      onPress={onPress}
    >
      <Text>{label}</Text>
      <SymbolImage
        className="text-body text-muted-foreground shrink-0"
        name="arrow.up.right.square"
      />
    </Pressable>
  </TextClassContext.Provider>
);

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
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("legal.title"),
        }}
      />

      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <MenuList>
          <LegalLink label={t("legal.privacyPolicy")} onPress={openPrivacy} />
          <Separator />
          <LegalLink label={t("legal.terms")} onPress={openTerms} />
          <Separator />
          <AlertDialog
            actions={[
              { label: t("common.cancel"), role: "cancel" },
              {
                label: t("legal.deleteConfirm.confirm"),
                onPress: () => deleteUser(),
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
        </MenuList>
      </ScrollView>
    </>
  );
};

export default LegalScreen;
