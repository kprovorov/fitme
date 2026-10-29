import { useUser } from "@clerk/expo";
import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocales } from "expo-localization";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView } from "react-native";
import { useResolveClassNames } from "uniwind";
import ProfileForm, {
  type ProfileFormValues,
  profileSaveErrorMessage,
} from "~/components/forms/profile-form";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { useStoreProfileMutation } from "~/hooks/mutations/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { rateLimitedFor } from "~/lib/api/client";
import { IS_E2E } from "~/lib/constants";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { user } = useUser();
  const { data: profile, isPending: isProfilePending } = useProfileQuery();

  const locales = useLocales();
  const deviceMeasurementSystem = (locales[0]?.measurementSystem ??
    "metric") as MeasurementSystem;
  const measurementSystem: MeasurementSystem =
    profile?.measurement_system ?? deviceMeasurementSystem;

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
    onSuccess: async (_, variables) => {
      // Edit Profile seeds its form from the cached Profile, so read the saved
      // one before moving on (the save stays pending meanwhile).
      await queryClient.invalidateQueries({
        queryKey: useProfileQuery.getKey(),
      });
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
  });

  // Title 1 rather than Large Title (34 pt), so the title fits a 375 pt wide
  // iPhone.
  const largeTitle = useResolveClassNames("text-title-1-emphasized");

  const handleSubmit = useCallback(
    ({ age, gender, height, weight }: ProfileFormValues) =>
      storeProfile({
        age,
        gender,
        height,
        measurementSystem,
        profile: profile ?? null,
        weight,
      }),
    [measurementSystem, profile, storeProfile]
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
      {!user || isProfilePending ? (
        // A scroll view from the first render, so the large title has one to
        // track before the form mounts.
        <ScrollView
          contentContainerClassName="flex-1 items-center justify-center"
          contentInsetAdjustmentBehavior="automatic"
        >
          <ActivityIndicator colorClassName="accent-foreground" />
        </ScrollView>
      ) : (
        <ProfileForm
          defaultValues={{
            age: profile?.age ?? undefined,
            gender: profile?.gender,
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
      )}
    </>
  );
}
