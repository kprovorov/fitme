import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { deleteToken } from "~/lib/api";
import { VStack } from "../ui/vstack";
import { H1, H2, H3, H4, Muted, P } from "../ui/typography";
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
import { useCustomerInfoQuery, useIsProQuery } from "~/hooks/revenueCat";
import * as Sentry from "@sentry/react-native";
import Purchases from "react-native-purchases";
import { Linking } from "react-native";

export default function ProfileView() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const { mutateAsync: logout } = useLogoutMutation({
    onSuccess: async () => {
      Sentry.setUser(null);
      await deleteToken();
      queryClient.clear();
      router.replace("/auth/login");
    },
  });

  const { mutateAsync: deleteUser } = useDeleteUserMutation({
    onSuccess: async () => {
      Sentry.setUser(null);
      await deleteToken();
      queryClient.clear();
      router.replace("/auth/login");
    },
  });

  const { data: isPro } = useIsProQuery();

  const { data: customerInfo } = useCustomerInfoQuery();

  return (
    !!user && (
      <VStack className="items-stretch justify-between h-full">
        <VStack className="items-stretch">
          <VStack className="items-start gap-0 border-b-2 border-border pb-4">
            <Muted className="text-muted-foreground font-bold text-xl">
              Welcome,
            </Muted>
            <Text className="text-4xl font-bold">{user.name}</Text>
          </VStack>
          <H2>Your Plan</H2>
          {isPro ? (
            <>
              <Text className="text-primary font-bold">You're Pro!</Text>
              <P>
                You have access to all of our features. You can cancel your
                subscription at any time.
              </P>
              {!!customerInfo?.managementURL && (
                <Button
                  onPress={() =>
                    customerInfo.managementURL &&
                    Linking.openURL(customerInfo.managementURL)
                  }
                >
                  <Text>Manage Subscription</Text>
                </Button>
              )}
            </>
          ) : (
            <>
              <Text>You're on a free plan</Text>
              <Button onPress={() => RevenueCatUI.presentPaywall()}>
                <Text>Upgrade to Pro</Text>
              </Button>
            </>
          )}
        </VStack>
        <VStack className="items-stretch">
          <Button onPress={() => logout()}>
            <Text>Logout</Text>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="link">
                <Text className="text-muted-foreground">Delete Account</Text>
              </Button>
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
        </VStack>
      </VStack>
    )
  );
}
