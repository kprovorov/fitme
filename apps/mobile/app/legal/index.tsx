import { Link, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import { i18n } from "~/lib/i18n";

export default function LegalScreen() {
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
          <Link asChild href="https://fitmeproject.com/privacy-policy">
            <MenuListItem icon="square-arrow-out-up-right">
              <Text>{t("legal.privacyPolicy")}</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link asChild href="https://fitmeproject.com/terms">
            <MenuListItem icon="square-arrow-out-up-right">
              <Text>{t("legal.terms")}</Text>
            </MenuListItem>
          </Link>
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
}
