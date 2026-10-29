import { useUser } from "@clerk/expo";
import { Link, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView } from "react-native";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { HStack } from "~/components/ui/hstack";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Text } from "~/components/ui/text";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useChoiceLabels } from "~/lib/choices";
import { i18n } from "~/lib/i18n";

export default function SettingsScreen() {
  const { user } = useUser();
  const { data: profile } = useProfileQuery();
  const labels = useChoiceLabels();
  const { t } = useTranslation(undefined, { i18n });

  const { mutate: deleteUser, isPending } = useDeleteUserMutation();

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
          title: t("settings.title"),
        }}
      />
      <ScrollView
        className="flex-1 p-6"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {!!user && (
          <>
            <MenuList>
              <Link asChild href="/settings/measurement-system">
                <MenuListItem icon="chevron-right">
                  <HStack className="flex-1 justify-between">
                    <Text>{t("settings.measurementSystem")}</Text>
                    <Text className="text-footnote text-muted-foreground">
                      {labels.measurementSystem(
                        profile?.measurement_system ?? "metric"
                      )}
                    </Text>
                  </HStack>
                </MenuListItem>
              </Link>
            </MenuList>

            <MenuList className="mt-4">
              <AlertDialog
                actions={[
                  { label: t("common.cancel"), role: "cancel" },
                  {
                    label: t("settings.deleteConfirm.confirm"),
                    onPress: () => deleteUser(),
                    role: "destructive",
                  },
                ]}
                className="w-full"
                message={t("settings.deleteConfirm.message")}
                title={t("settings.deleteConfirm.title")}
              >
                <MenuListItem
                  disabled={isPending}
                  testID="delete-account-button"
                >
                  <Text className="text-destructive">
                    {t("settings.deleteAccount")}
                  </Text>
                </MenuListItem>
              </AlertDialog>
            </MenuList>
          </>
        )}
      </ScrollView>
    </>
  );
}
