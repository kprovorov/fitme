import { useUser } from "@clerk/expo";
import { formatDate } from "@fitme/i18n";
import * as Sentry from "@sentry/react-native";
import { nativeApplicationVersion, nativeBuildVersion } from "expo-application";
import { router } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import LifetimeTotals from "~/components/profile/lifetime-totals";
import {
  ProfileListRow,
  ProfileListSection,
} from "~/components/profile/profile-list";
import SubscriptionCard from "~/components/profile/subscription-card";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { useLogoutMutation } from "~/hooks/mutations/auth";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { useChoiceLabels } from "~/lib/choices";
import { isClerkNetworkFailure } from "~/lib/clerk";
import {
  APP_STORE_REVIEW_URL,
  openAppSettings,
  openUrl,
} from "~/lib/external-links";
import { useAppLanguage, useI18n } from "~/lib/i18n";
import { measurementSystemOf } from "~/lib/profile";
import { showToast } from "~/lib/toast";
import { getProfileHeader } from "~/lib/user-name";

const openAppStoreReview = () => {
  void openUrl(APP_STORE_REVIEW_URL);
};

const openEditProfile = () => router.push("/settings/edit-profile");

const openAccountSecurity = () => router.push("/account-security");

const openUnits = () => router.push("/settings/measurement-system");

const openSupport = () => router.push("/support");

const openLegal = () => router.push("/legal");

const openLanguageSettings = () => {
  void openAppSettings();
};

/**
 * The header: the User's Profile photo (Clerk's `imageUrl`, its default
 * picture for a User without one), their name and email, and when they
 * joined, in the App language.
 */
const ProfileHeader = () => {
  const { user } = useUser();
  const i18n = useI18n();
  const { t } = useTranslation();

  if (!user) {
    return null;
  }

  const { initial, subtitle, title } = getProfileHeader({
    email: user.primaryEmailAddress?.emailAddress,
    fullName: user.fullName,
  });

  return (
    <View className="gap-sm w-full items-center">
      <Avatar
        alt={t("profilePhoto.title")}
        className="size-22"
        key={user.imageUrl}
      >
        <AvatarImage
          source={{ uri: user.imageUrl }}
          testID="profile-header-photo"
        />
        <AvatarFallback>
          <Text className="text-title-1-emphasized">{initial}</Text>
        </AvatarFallback>
      </Avatar>
      <View className="items-center gap-0.5">
        <Text className="text-title-2-emphasized text-foreground text-center">
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-subhead text-muted-foreground text-center">
            {subtitle}
          </Text>
        ) : null}
        {user.createdAt ? (
          <Text className="text-footnote text-muted-foreground text-center">
            {t("profile.memberSince", {
              date: formatDate(i18n, user.createdAt, "monthYear"),
            })}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

/** The build the User runs (`Fitme 1.4.0 (212)`), for telling support. */
const VersionLine = () => {
  const { t } = useTranslation();

  if (!(nativeApplicationVersion && nativeBuildVersion)) {
    return null;
  }

  return (
    <Text
      className="text-caption-1 text-muted-foreground w-full text-center"
      testID="profile-version"
    >
      {t("profile.version", {
        build: nativeBuildVersion,
        version: nativeApplicationVersion,
      })}
    </Text>
  );
};

/**
 * The redesigned Profile (Figma's Profile – Free, 1476:3301), shown while the
 * Profile redesign flag is on: the header, the Lifetime totals (or the New
 * user state), the Subscription card, then the lists.
 */
const ProfileRedesignView = () => {
  const { t } = useTranslation();
  const language = useAppLanguage();
  const labels = useChoiceLabels();
  const { data: profile } = useProfileQuery();

  // Clearing the cache and RevenueCat happens in AuthSync once Clerk signs out.
  // On a failure the User is still signed in: say so, and report anything
  // but their connection.
  const { isPending: isLoggingOut, mutate: logout } = useLogoutMutation({
    onError: (error) => {
      if (!isClerkNetworkFailure(error)) {
        Sentry.captureException(error);
      }

      showToast(t("profile.logOutFailed"));
    },
    onSuccess: () => {
      router.replace("/auth/login");
    },
  });

  const handleLogout = useCallback(() => logout(), [logout]);

  return (
    <View className="gap-md w-full pt-2.5 pb-14">
      <ProfileHeader />

      <LifetimeTotals />

      <SubscriptionCard />

      <ProfileListSection title={t("profile.sections.account")}>
        <ProfileListRow
          first
          label={t("profile.rows.editProfile")}
          onPress={openEditProfile}
          testID="edit-profile-link"
        />
        <ProfileListRow
          label={t("profile.rows.accountSecurity")}
          onPress={openAccountSecurity}
          testID="account-security-link"
        />
        <ProfileListRow label={t("profile.rows.subscription")} />
      </ProfileListSection>

      <ProfileListSection title={t("profile.sections.preferences")}>
        <ProfileListRow
          first
          label={t("profile.rows.units")}
          onPress={openUnits}
          testID="units-link"
          value={
            profile === undefined || profile === null
              ? undefined
              : labels.measurementSystem(measurementSystemOf(profile))
          }
        />
        <ProfileListRow
          label={t("profile.rows.language")}
          onPress={openLanguageSettings}
          testID="language-link"
          value={t(`languages.${language}`)}
        />
      </ProfileListSection>

      <ProfileListSection title={t("profile.sections.help")}>
        <ProfileListRow
          first
          label={t("profile.rows.support")}
          onPress={openSupport}
        />
        <ProfileListRow
          label={t("profile.rows.rateFitme")}
          onPress={openAppStoreReview}
        />
        <ProfileListRow
          label={t("profile.rows.legalPrivacy")}
          onPress={openLegal}
        />
      </ProfileListSection>

      <Button
        disabled={isLoggingOut}
        label={t("profile.logOut")}
        onPress={handleLogout}
        size="lg"
        testID="logout-button"
        variant="destructive"
      />

      <VersionLine />
    </View>
  );
};

export default ProfileRedesignView;
