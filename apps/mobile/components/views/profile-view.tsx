import { useUser } from "@clerk/expo";
import { Link, router } from "expo-router";
import { useCallback } from "react";
import { Linking } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useLogoutMutation } from "~/hooks/mutations/auth";
import { useCustomerInfoQuery, useIsProQuery } from "~/hooks/revenueCat";
import { Heart } from "~/lib/icons/Heart";
import { Trophy } from "~/lib/icons/Trophy";
import { Volleyball } from "~/lib/icons/Volleyball";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Card, CardContent } from "../ui/card";
import { HStack } from "../ui/hstack";
import { MenuList, MenuListItem } from "../ui/menu-list";
import { Separator } from "../ui/separator";
import { Muted } from "../ui/typography";
import { VStack } from "../ui/vstack";

const APP_STORE_REVIEW_URL =
  "itms-apps://itunes.apple.com/app/viewContentsUserReviews/id6741153628?action=write-review";

const presentPaywall = () => RevenueCatUI.presentPaywall();

const openAppStoreReview = () => Linking.openURL(APP_STORE_REVIEW_URL);

export default function ProfileView() {
  const { user } = useUser();
  const name = user?.fullName ?? "";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  // Clearing the cache and RevenueCat happens in AuthSync once Clerk signs out.
  const { mutateAsync: logout } = useLogoutMutation({
    onSuccess: () => {
      router.replace("/auth/login");
    },
  });

  const { data: isPro } = useIsProQuery();

  const { data: customerInfo } = useCustomerInfoQuery();

  const managementURL = customerInfo?.managementURL;

  const openManagementURL = useCallback(() => {
    if (managementURL) {
      Linking.openURL(managementURL);
    }
  }, [managementURL]);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  return (
    !!user && (
      <VStack className="grow items-stretch justify-between gap-4">
        <HStack className="items-center justify-start">
          <Avatar alt={name}>
            <AvatarFallback>
              <Text>{name.charAt(0)}</Text>
            </AvatarFallback>
          </Avatar>
          <VStack className="items-stretch gap-0">
            <Text className="font-bold text-title-2">{name}</Text>
            <Muted>{email}</Muted>
          </VStack>
        </HStack>

        <Card>
          <VStack className="items-stretch gap-4 py-4">
            <CardContent>
              {isPro ? (
                <VStack className="items-stretch gap-2">
                  <HStack className="flex-1 justify-start gap-2">
                    <Trophy className="text-primary" size={20} />
                    <Text className="font-bold text-primary">
                      You&apos;re Pro!
                    </Text>
                  </HStack>
                  <Muted>
                    You have access to all of our features. You can cancel your
                    subscription at any time.
                  </Muted>
                  {!!managementURL && (
                    <Button onPress={openManagementURL} variant="secondary">
                      <Text>Manage Subscription</Text>
                    </Button>
                  )}
                </VStack>
              ) : (
                <VStack className="items-stretch gap-2">
                  <HStack className="flex-1 justify-start gap-2">
                    <Volleyball className="text-foreground" size={20} />
                    <Text className="font-bold text-foreground">
                      You&apos;re on a free plan
                    </Text>
                  </HStack>
                  <Muted>
                    Subscribe to Fitme Pro to get unlimited access to all of our
                    features
                  </Muted>
                  <Button onPress={presentPaywall}>
                    <Text>Upgrade to Pro</Text>
                  </Button>
                </VStack>
              )}
            </CardContent>
          </VStack>
        </Card>

        <MenuList>
          <Link asChild href="/settings/edit-profile">
            <MenuListItem icon="chevron-right" testID="edit-profile-link">
              <Text>Edit Profile</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link asChild href="/settings">
            <MenuListItem icon="chevron-right">
              <Text>Settings</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link asChild href="/support">
            <MenuListItem icon="chevron-right">
              <Text>Support</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link asChild href="/legal">
            <MenuListItem icon="chevron-right">
              <Text>Legal</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <MenuListItem onPress={handleLogout} testID="logout-button">
            <Text>Logout</Text>
          </MenuListItem>
        </MenuList>

        <MenuList>
          <MenuListItem onPress={openAppStoreReview}>
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
