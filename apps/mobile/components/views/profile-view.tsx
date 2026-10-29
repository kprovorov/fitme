import { useUser } from "@clerk/expo";
import { Link, router } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Linking } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";
import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useLogoutMutation } from "~/hooks/mutations/auth";
import { useCustomerInfoQuery, useIsProQuery } from "~/hooks/revenueCat";
import { i18n } from "~/lib/i18n";
import { getProfileHeader } from "~/lib/user-name";
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
  const { t } = useTranslation(undefined, { i18n });
  const { initial, subtitle, title } = getProfileHeader({
    email: user?.primaryEmailAddress?.emailAddress,
    fullName: user?.fullName,
  });

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
          <Avatar alt={title}>
            <AvatarFallback>
              {initial ? (
                <Text>{initial}</Text>
              ) : (
                <SymbolImage
                  className="text-body text-muted-foreground"
                  name="person.fill"
                />
              )}
            </AvatarFallback>
          </Avatar>
          <VStack className="shrink items-stretch gap-0">
            <Text className="text-title-2-emphasized" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? <Muted numberOfLines={1}>{subtitle}</Muted> : null}
          </VStack>
        </HStack>

        <Card>
          <CardContent>
            {isPro ? (
              <VStack className="items-stretch gap-2">
                <HStack className="flex-1 justify-start gap-2">
                  <SymbolImage
                    className="text-body-emphasized text-primary"
                    name="trophy.fill"
                  />
                  <Text className="text-body-emphasized text-primary">
                    {t("profile.pro.title")}
                  </Text>
                </HStack>
                <Muted>{t("profile.pro.description")}</Muted>
                {!!managementURL && (
                  <Button
                    label={t("profile.pro.manage")}
                    onPress={openManagementURL}
                    variant="secondary"
                  />
                )}
              </VStack>
            ) : (
              <VStack className="items-stretch gap-2">
                <HStack className="flex-1 justify-start gap-2">
                  <SymbolImage
                    className="text-body-emphasized text-foreground"
                    name="figure.volleyball"
                  />
                  <Text className="text-body-emphasized text-foreground">
                    {t("profile.free.title")}
                  </Text>
                </HStack>
                <Muted>{t("profile.free.description")}</Muted>
                <Button
                  label={t("profile.free.upgrade")}
                  onPress={presentPaywall}
                />
              </VStack>
            )}
          </CardContent>
        </Card>

        <MenuList>
          <Link asChild href="/settings/edit-profile">
            <MenuListItem icon="chevron-right" testID="edit-profile-link">
              <Text>{t("profile.editProfile")}</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link asChild href="/settings">
            <MenuListItem icon="chevron-right" testID="settings-link">
              <Text>{t("profile.settings")}</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link asChild href="/support">
            <MenuListItem icon="chevron-right">
              <Text>{t("profile.support")}</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <Link asChild href="/legal">
            <MenuListItem icon="chevron-right">
              <Text>{t("profile.legal")}</Text>
            </MenuListItem>
          </Link>
          <Separator />
          <MenuListItem onPress={handleLogout} testID="logout-button">
            <Text>{t("profile.logout")}</Text>
          </MenuListItem>
        </MenuList>

        <MenuList>
          <MenuListItem onPress={openAppStoreReview}>
            <HStack className="flex-1 justify-start gap-4">
              <SymbolImage
                className="text-foreground text-title-2"
                name="heart"
              />
              <VStack className="items-start gap-0">
                <Text className="text-body-emphasized text-primary">
                  {t("profile.rate.title")}
                </Text>
                <Text>{t("profile.rate.action")}</Text>
              </VStack>
            </HStack>
          </MenuListItem>
        </MenuList>
      </VStack>
    )
  );
}
