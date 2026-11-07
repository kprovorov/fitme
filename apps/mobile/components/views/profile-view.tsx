import { useUser } from "@clerk/expo";
import { Link, router } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import RevenueCatUI from "react-native-purchases-ui";

import { SymbolImage } from "~/components/symbol-image";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useLogoutMutation } from "~/hooks/mutations/auth";
import { useCustomerInfoQuery, useIsProQuery } from "~/hooks/revenueCat";
import { openUrl } from "~/lib/external-links";
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

const openAppStoreReview = () => openUrl(APP_STORE_REVIEW_URL);

const ProfileView = () => {
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
      void openUrl(managementURL);
    }
  }, [managementURL]);

  const handleLogout = useCallback(() => {
    void logout();
  }, [logout]);

  return (
    !!user && (
      <VStack className="grow items-stretch justify-between">
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
          <View className="flex shrink flex-col items-stretch justify-center">
            <Text numberOfLines={1} variant="h3">
              {title}
            </Text>
            {subtitle ? <Muted numberOfLines={1}>{subtitle}</Muted> : null}
          </View>
        </HStack>

        <Card>
          <CardContent>
            {isPro ? (
              <View className="flex flex-col items-stretch justify-center gap-2">
                <View className="flex flex-1 flex-row items-center justify-start gap-2">
                  <SymbolImage
                    className="text-body-emphasized text-primary"
                    name="trophy.fill"
                  />
                  <Text className="text-primary" variant="large">
                    {t("profile.pro.title")}
                  </Text>
                </View>
                <Muted>{t("profile.pro.description")}</Muted>
                {!!managementURL && (
                  <Button
                    label={t("profile.pro.manage")}
                    onPress={openManagementURL}
                    size="lg"
                    variant="secondary"
                  />
                )}
              </View>
            ) : (
              <View className="flex flex-col items-stretch justify-center gap-2">
                <View className="flex flex-1 flex-row items-center justify-start gap-2">
                  <SymbolImage
                    className="text-body-emphasized text-foreground"
                    name="figure.volleyball"
                  />
                  <Text variant="large">{t("profile.free.title")}</Text>
                </View>
                <Muted>{t("profile.free.description")}</Muted>
                <Button
                  label={t("profile.free.upgrade")}
                  onPress={(...args) => {
                    void presentPaywall(...args);
                  }}
                  size="lg"
                />
              </View>
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
            <HStack className="flex-1 justify-start">
              <SymbolImage
                className="text-foreground text-title-2"
                name="heart"
              />
              <View className="flex flex-col items-start justify-center">
                <Text className="text-primary" variant="large">
                  {t("profile.rate.title")}
                </Text>
                <Text>{t("profile.rate.action")}</Text>
              </View>
            </HStack>
          </MenuListItem>
        </MenuList>
      </VStack>
    )
  );
};

export default ProfileView;
