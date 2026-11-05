import { useUser } from "@clerk/expo";
import { rateLimitedFor } from "@fitme/api-client";
import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useLocales } from "expo-localization";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView } from "react-native";
import { useResolveClassNames } from "uniwind";

import ProfileForm, {
  profileSaveErrorMessage,
} from "~/components/forms/profile-form";
import type { ProfileFormValues } from "~/components/forms/profile-form";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { useStoreProfileMutation } from "~/hooks/mutations/profiles";
import type { StoreProfileData } from "~/hooks/mutations/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { IS_E2E } from "~/lib/constants";
import { storage } from "~/lib/mmkv";
import { genderOf, measurementSystemOf } from "~/lib/profile";
import { segmentClient } from "~/lib/segment";

export default function ProfileScreen() {
  const { t } = useTranslation();

  const { user } = useUser();

  const {
    data: profile,
    error: profileError,
    isError: isProfileError,
    isPending: isProfilePending,
    refetch: refetchProfile,
  } = useProfileQuery();

  // Without the Profile read, the form can't know whether one is saved (a
  // save would then replace it), so a failed first read is its error state,
  // a 429 giving the wait. A failed refresh keeps the Profile already read.
  const isLoadError = isProfileError && profile === undefined;
  const loadWaitSeconds = rateLimitedFor(profileError);

  const locales = useLocales();

  const deviceMeasurementSystem = (locales[0]?.measurementSystem ??
    "metric") as MeasurementSystem;

  const measurementSystem: MeasurementSystem = profile
    ? measurementSystemOf(profile)
    : deviceMeasurementSystem;

  const {
    mutate: storeProfile,
    isPending,
    error,
  } = useStoreProfileMutation({
    onError: (e) => {
      // Too many requests is the User's to wait out, not a bug.
      if (rateLimitedFor(e) === null) {
        Sentry.captureException(e);
      }
    },
  });

  // Edit Profile seeds its form from the cached Profile, which the mutation
  // has set to the saved one by the time this runs. On the call, not the
  // hook: a hook-level `onSuccess` would replace the mutation's own.
  const handleSaved = useCallback(
    (_profile: unknown, variables: StoreProfileData) => {
      if (user) {
        storage.set(`onboarding.seen.${user.id}`, true);
      }

      if (!IS_E2E) {
        segmentClient.track("Profile Filled", {
          age: variables.age,
          gender: variables.gender,
          weight_unit: measurementSystem,
        });
      }

      router.dismissTo("/planner");
    },
    [measurementSystem, user]
  );

  // Title 1 rather than Large Title (34 pt), so the title fits a 375 pt wide
  // iPhone.
  const largeTitle = useResolveClassNames("text-title-1-emphasized");

  const handleRetry = useCallback(() => {
    refetchProfile();
  }, [refetchProfile]);

  const handleSubmit = useCallback(
    ({ age, gender, height, weight }: ProfileFormValues) =>
      storeProfile(
        {
          age,
          gender,
          height,
          measurementSystem,
          profile: profile ?? null,
          weight,
        },
        { onSuccess: handleSaved }
      ),
    [handleSaved, measurementSystem, profile, storeProfile]
  );

  return (
    <>
      {/* A native large title, not a heading in the content: opening a wheel
          scrolls the form, and the title then collapses into the header
          instead of sliding under its buttons. */}
      <Stack.Screen
        options={{
          headerLargeTitleEnabled: true,
          headerLargeTitleShadowVisible: false,
          headerLargeTitleStyle: {
            fontFamily: largeTitle.fontFamily,
            fontSize: largeTitle.fontSize,
          },
          headerTitle: t("onboarding.profile.title"),
          headerTitleStyle: { fontFamily: "NunitoSans12pt-Bold" },
        }}
      />
      {isLoadError ? (
        <ScrollView
          contentContainerClassName="flex-1 items-stretch justify-center gap-4 p-6"
          contentInsetAdjustmentBehavior="automatic"
        >
          <ErrorMessage className="text-center">
            {loadWaitSeconds === null
              ? t("onboarding.profile.loadError")
              : t("common.rateLimited", { seconds: loadWaitSeconds })}
          </ErrorMessage>
          <Button
            label={t("common.tryAgain")}
            onPress={handleRetry}
            variant="secondary"
          />
        </ScrollView>
      ) : null}
      {!isLoadError && (!user || isProfilePending) ? (
        // A scroll view from the first render, so the large title has one to
        // track before the form mounts.
        <ScrollView
          contentContainerClassName="flex-1 items-center justify-center"
          contentInsetAdjustmentBehavior="automatic"
        >
          <ActivityIndicator colorClassName="accent-foreground" />
        </ScrollView>
      ) : null}
      {!isLoadError && user && !isProfilePending ? (
        <ProfileForm
          defaultValues={{
            age: profile?.age ?? undefined,
            gender: genderOf(profile),
            height: profile?.height ?? undefined,
            weight: profile?.weight ?? undefined,
          }}
          footer={
            !!error && (
              <ErrorMessage>{profileSaveErrorMessage(t, error)}</ErrorMessage>
            )
          }
          heading={<Text>{t("onboarding.profile.description")}</Text>}
          isSubmitting={isPending}
          measurementSystem={measurementSystem}
          onSubmit={handleSubmit}
          submitLabel={t("onboarding.profile.next")}
          submitSystemImage="arrow.right"
        />
      ) : null}
    </>
  );
}
