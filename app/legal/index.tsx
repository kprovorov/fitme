import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack } from "expo-router";
import { ScrollView } from "react-native";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { Separator } from "~/components/ui/separator";
import { Text } from "~/components/ui/text";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import { useCurrentUserQuery } from "~/hooks/queries/auth";

export default function LegalScreen() {
  const queryClient = useQueryClient();

  const { data: _user } = useCurrentUserQuery();

  const { mutateAsync: deleteUser } = useDeleteUserMutation({
    onSuccess: () => {
      Sentry.setUser(null);
      queryClient.clear();
      router.replace("/auth/login");
    },
  });

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Legal",
          headerBackButtonDisplayMode: "minimal",
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
              <Text>Privacy Policy</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link asChild href="https://fitmeproject.com/terms">
            <MenuListItem icon="square-arrow-out-up-right">
              <Text>Terms of Service</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <AlertDialog
            actions={[
              { label: "Cancel", role: "cancel" },
              {
                label: "Yes, Delete My Account",
                role: "destructive",
                onPress: () => deleteUser(),
              },
            ]}
            className="w-full"
            message="This action cannot be undone. This will permanently delete your account and remove your data from our servers."
            title="Are you sure you want to delete your account?"
          >
            <MenuListItem>
              <Text>Delete Account</Text>
            </MenuListItem>
          </AlertDialog>
        </MenuList>
      </ScrollView>
    </>
  );
}
