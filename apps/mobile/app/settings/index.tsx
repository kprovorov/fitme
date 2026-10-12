import { useUser } from "@clerk/expo";
import { getMeasurementSystemLabel } from "@fitme/core";
import { Link, router, Stack } from "expo-router";
import { Alert, ScrollView } from "react-native";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { HStack } from "~/components/ui/hstack";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Text } from "~/components/ui/text";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { getClerkErrorMessage } from "~/lib/clerk";

export default function SettingsScreen() {
  const { user } = useUser();
  const { data: profile } = useProfileQuery();

  const { mutate: deleteUser, isPending } = useDeleteUserMutation({
    onError: (error) => {
      Alert.alert("Couldn't delete your account", getClerkErrorMessage(error));
    },
    onSuccess: () => {
      router.replace("/auth/login");
    },
  });

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
          title: "Settings",
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
                    <Text>Measurement System</Text>
                    <Text className="text-footnote text-muted-foreground">
                      {getMeasurementSystemLabel(
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
                  { label: "Cancel", role: "cancel" },
                  {
                    label: "Delete",
                    onPress: () => deleteUser(),
                    role: "destructive",
                  },
                ]}
                className="w-full"
                message="This will permanently delete your account and all associated data. This action cannot be undone."
                title="Delete Account"
              >
                <MenuListItem
                  disabled={isPending}
                  testID="delete-account-button"
                >
                  <Text className="text-destructive">Delete Account</Text>
                </MenuListItem>
              </AlertDialog>
            </MenuList>
          </>
        )}
      </ScrollView>
    </>
  );
}
