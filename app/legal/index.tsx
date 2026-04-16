import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Link, router, Stack } from "expo-router";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
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
          headerTransparent: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          title: "Legal",
          headerBackButtonDisplayMode: "minimal",
        }}
      />

      <SafeAreaView className="flex-1">
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <MenuListItem>
                  <Text>Delete Account</Text>
                </MenuListItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Are you sure you want to delete your account?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    your account and remove your data from our servers.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    <Text>Cancel</Text>
                  </AlertDialogCancel>
                  <Button onPress={() => deleteUser()} variant="destructive">
                    <Text>Yes, Delete My Account</Text>
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </MenuList>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
