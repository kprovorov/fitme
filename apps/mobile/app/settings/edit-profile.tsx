import { useUser } from "@clerk/expo";
import { rateLimitedFor } from "@fitme/api-client";
import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocales } from "expo-localization";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";

import ProfileForm, {
  profileSaveErrorMessage,
} from "~/components/forms/profile-form";
import type { ProfileFormValues } from "~/components/forms/profile-form";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { VStack } from "~/components/ui/vstack";
import { useUpdateProfileMutation } from "~/hooks/mutations/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { i18n } from "~/lib/i18n";
import { genderOf, measurementSystemOf } from "~/lib/profile";

const useDeviceMeasurementSystem = (): MeasurementSystem => {
  const locales = useLocales();

  return locales[0]?.measurementSystem ?? "metric";
};

const EditProfileScreen = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation(undefined, { i18n });

  const { isLoaded: isUserLoaded, user } = useUser();

  const {
    data: profile,
    error: profileError,
    isPending: isProfilePending,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useProfileQuery();

  const isPendingLoad = !isUserLoaded || isProfilePending;
  // A failed refresh keeps the Profile already read; only a failed first read
  // is an error, a 429 giving the wait.
  const isLoadError = isProfileError && profile === undefined;
  const loadWaitSeconds = rateLimitedFor(profileError);
  const name = user?.fullName ?? "";

  // Stored values are in the profile's system; the device locale only matters
  // when there is no profile yet.
  const deviceMeasurementSystem = useDeviceMeasurementSystem();

  const measurementSystem: MeasurementSystem = profile
    ? measurementSystemOf(profile)
    : deviceMeasurementSystem;

  const {
    mutate: updateProfile,
    isPending,
    error,
  } = useUpdateProfileMutation({
    // A success shows the answer as the Profile (the mutation seeds it). A
    // failure doesn't prove nothing was saved: the Profile may be saved even
    // if the name is not, or the answer was lost after the save, so it's
    // read again. Clerk's user hook picks up the new name by itself.
    onError: (e) => {
      // Too many requests is the User's to wait out, not a bug.
      if (rateLimitedFor(e) === null) {
        Sentry.captureException(e);
      }

      queryClient.invalidateQueries({ queryKey: useProfileQuery.getKey() });
    },
  });

  const handleRetry = useCallback(() => {
    refetchProfile();
  }, [refetchProfile]);

  const handleSubmit = useCallback(
    ({ age, gender, height, name: formName, weight }: ProfileFormValues) => {
      // The form is only rendered once the User and Profile have loaded.
      if (!user) {
        return;
      }

      // On the call, not the hook: a hook-level `onSuccess` would replace the
      // mutation's own, which shows the saved Profile.
      updateProfile(
        {
          age,
          gender,
          height,
          measurementSystem,
          name: formName ?? name,
          profile: profile ?? null,
          weight,
        },
        { onSuccess: () => router.back() }
      );
    },
    [measurementSystem, name, profile, updateProfile, user]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans12pt-Bold",
            fontWeight: "bold",
          },
          headerTransparent: true,
          title: t("editProfile.title"),
        }}
      />
      {isPendingLoad && !isLoadError ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator colorClassName="accent-foreground" />
        </View>
      ) : null}
      {isLoadError ? (
        <View className="flex-1 p-6">
          <VStack className="flex-1 items-stretch justify-center">
            <ErrorMessage className="text-center">
              {loadWaitSeconds === null
                ? t("editProfile.loadError")
                : t("common.rateLimited", { seconds: loadWaitSeconds })}
            </ErrorMessage>
            <Button
              label={t("common.tryAgain")}
              onPress={handleRetry}
              size="lg"
              variant="secondary"
            />
          </VStack>
        </View>
      ) : null}
      {!!user && profile !== undefined && (
        <ProfileForm
          defaultValues={{
            age: profile?.age ?? undefined,
            gender: genderOf(profile),
            height: profile?.height ?? undefined,
            name,
            weight: profile?.weight ?? undefined,
          }}
          footer={
            !!error && (
              <ErrorMessage>{profileSaveErrorMessage(t, error)}</ErrorMessage>
            )
          }
          isSubmitting={isPending}
          measurementSystem={measurementSystem}
          onSubmit={handleSubmit}
          showName
          submitLabel={t("editProfile.save")}
          submitTestID="edit-profile-save-button"
        />
      )}
    </>
  );
};

export default EditProfileScreen;
