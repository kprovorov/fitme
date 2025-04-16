import React from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { Text } from "~/components/ui/text";
import { Link, router, Stack } from "expo-router";
import { HeaderBackButton } from "~/components/ui/header-back-button";
import { MenuList, MenuListItem } from "~/components/ui/menu-list";
import { HStack } from "~/components/ui/hstack";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { AlertDialog } from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { useDeleteUserMutation } from "~/hooks/mutations/auth";
import { useQueryClient } from "@tanstack/react-query";
import { deleteToken } from "~/lib/api";
import * as Sentry from "@sentry/react-native";
import { Trash } from "lucide-react-native";
import { Separator } from "~/components/ui/separator";

export default function LegalScreen() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const { mutateAsync: deleteUser } = useDeleteUserMutation({
    onSuccess: async () => {
      Sentry.setUser(null);
      await deleteToken();
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
            fontFamily: "NunitoSans-Bold",
            fontWeight: "bold",
          },
          title: "Legal",
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <SafeAreaProvider>
        <SafeAreaView className="flex-1">
          <ScrollView
            className="flex-1 p-6"
            showsVerticalScrollIndicator={false}
          >
            <MenuList>
              <Link href="https://fitmeproject.com/privacy-policy" asChild>
                <MenuListItem icon="square-arrow-out-up-right">
                  <Text>Privacy Policy</Text>
                </MenuListItem>
              </Link>
              <Separator />
              <Link href="https://fitmeproject.com/terms" asChild>
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
                    <Button variant="destructive" onPress={() => deleteUser()}>
                      <Text>Yes, Delete My Account</Text>
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </MenuList>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
