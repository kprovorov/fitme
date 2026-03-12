import { useQueryClient } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import React from "react";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useCurrentUserQuery } from "~/hooks/queries/auth";
import { VStack } from "../ui/vstack";
import { Muted } from "../ui/typography";
import { useLogoutMutation } from "~/hooks/mutations/auth";
import RevenueCatUI from "react-native-purchases-ui";
import { useCustomerInfoQuery, useIsProQuery } from "~/hooks/revenueCat";
import * as Sentry from "@sentry/react-native";
import { Linking } from "react-native";
import { HStack } from "../ui/hstack";
import { Separator } from "../ui/separator";
import { MenuList, MenuListItem } from "../ui/menu-list";
import { Card, CardContent } from "../ui/card";
import { Trophy } from "~/lib/icons/Trophy";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Heart } from "~/lib/icons/Heart";
import { Volleyball } from "~/lib/icons/Volleyball";

export default function ProfileView() {
  const queryClient = useQueryClient();

  const { data: user } = useCurrentUserQuery();

  const { mutateAsync: logout } = useLogoutMutation({
    onSuccess: async () => {
      Sentry.setUser(null);
      queryClient.clear();
      router.replace("/auth/login");
    },
  });

  const { data: isPro } = useIsProQuery();

  const { data: customerInfo } = useCustomerInfoQuery();

  return (
    !!user && (
      <VStack className="items-stretch justify-between grow gap-4">
        <HStack className="items-center justify-start">
          <Avatar alt={user.name}>
            <AvatarFallback>
              <Text>{user.name.charAt(0)}</Text>
            </AvatarFallback>
          </Avatar>
          <VStack className="items-stretch gap-0">
            <Text className="text-xl font-bold">{user.name}</Text>
            <Muted>{user.email}</Muted>
          </VStack>
        </HStack>

        <Card>
          <VStack className="items-stretch gap-4 py-4">
            <CardContent>
              {isPro ? (
                <VStack className="items-stretch gap-2">
                  <HStack className="flex-1 justify-start gap-2">
                    <Trophy className="text-primary" size={20} />
                    <Text className="text-primary font-bold">
                      You&apos;re Pro!
                    </Text>
                  </HStack>
                  <Muted>
                    You have access to all of our features. You can cancel your
                    subscription at any time.
                  </Muted>
                  {!!customerInfo?.managementURL && (
                    <Button
                      variant="secondary"
                      onPress={() =>
                        customerInfo.managementURL &&
                        Linking.openURL(customerInfo.managementURL)
                      }
                    >
                      <Text>Manage Subscription</Text>
                    </Button>
                  )}
                </VStack>
              ) : (
                <VStack className="items-stretch gap-2">
                  <HStack className="flex-1 justify-start gap-2">
                    <Volleyball className="text-foreground" size={20} />
                    <Text className="text-foreground font-bold">
                      You&apos;re on a free plan
                    </Text>
                  </HStack>
                  <Muted>
                    Subscribe to Fitme Pro to get unlimited access to all of our
                    features
                  </Muted>
                  <Button onPress={() => RevenueCatUI.presentPaywall()}>
                    <Text>Upgrade to Pro</Text>
                  </Button>
                </VStack>
              )}
            </CardContent>
          </VStack>
        </Card>

        <MenuList>
          <Link href="/settings" asChild>
            <MenuListItem icon="chevron-right">
              <Text>Settings</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link href="/support" asChild>
            <MenuListItem icon="chevron-right">
              <Text>Support</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link href="/legal" asChild>
            <MenuListItem icon="chevron-right">
              <Text>Legal</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <MenuListItem onPress={() => logout()} testID="logout-button">
            <Text>Logout</Text>
          </MenuListItem>
        </MenuList>

        <MenuList>
          <MenuListItem
            onPress={() =>
              Linking.openURL(
                "itms-apps://itunes.apple.com/app/viewContentsUserReviews/id6741153628?action=write-review",
              )
            }
          >
            <HStack className="flex-1 justify-start gap-4">
              <Heart className="text-foreground" size={24} />
              <VStack className="items-start gap-0">
                <Text className="font-bold text-primary">Like the app?</Text>
                <Text>Rate it in the App Store!</Text>
              </VStack>
            </HStack>
          </MenuListItem>
        </MenuList>
      </VStack>
    )
  );
}
