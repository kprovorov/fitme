import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { deleteToken } from "~/lib/api";
import { VStack } from "../ui/vstack";
import { H3, P } from "../ui/typography";
import {
  useDeleteUserMutation,
  useLogoutMutation,
} from "~/hooks/mutations/auth";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import RevenueCatUI from "react-native-purchases-ui";
import { useIsProQuery } from "~/hooks/revenueCat";

export default function ProfileView() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const { mutateAsync: logout } = useLogoutMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      router.replace("/auth/login");
    },
  });

  const { mutateAsync: deleteUser } = useDeleteUserMutation({
    onSuccess: async () => {
      await deleteToken();
      await queryClient.invalidateQueries({ queryKey: ["user"] });
      router.replace("/auth/login");
    },
  });

  const { data: isPro } = useIsProQuery();

  return (
    !!user && (
      <VStack>
        <H3>Welcome, {user.name}! 👋</H3>
        <P>{user.email}</P>
        {isPro ? (
          <Text className="text-primary font-bold">Pro</Text>
        ) : (
          <Text>Free Plan</Text>
        )}
        <Button onPress={() => logout()}>
          <Text>Logout</Text>
        </Button>
        <Button onPress={async () => await RevenueCatUI.presentPaywall()}>
          <Text>Show Paywall</Text>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">
              <Text>Delete Account</Text>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Are you sure you want to delete your account?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your
                account and remove your data from our servers.
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
      </VStack>
    )
  );
}
