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
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { VStack } from "~/components/ui/vstack";
import { useUpdateProfileMutation } from "~/hooks/mutations/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { i18n } from "~/lib/i18n";
import { genderOf, measurementSystemOf } from "~/lib/profile";

const useDeviceMeasurementSystem = (): MeasurementSystem => {
  const locales = useLocales();

  return locales[0]?.measurementSystem ?? "metric";
};

/** Clerk's first and last name, each `""` without one, as the fields show them. */
const clerkNames = (
  user: { firstName: string | null; lastName: string | null } | null | undefined
) => ({ firstName: user?.firstName ?? "", lastName: user?.lastName ?? "" });

/**
 * The User's Profile photo, as Clerk serves it (its default picture without
 * one of their own); changing it is the Profile Photo sheet's.
 */
const ProfilePhoto = ({
  fullName,
  imageUrl,
}: {
  fullName: string | null;
  imageUrl: string;
}) => {
  const { t } = useTranslation(undefined, { i18n });
  const initial = (fullName ?? "").trim().charAt(0).toUpperCase();

  return (
    <View className="items-center pt-2">
      <Avatar alt={t("profilePhoto.title")} className="size-22">
        <AvatarImage source={{ uri: imageUrl }} testID="edit-profile-photo" />
        <AvatarFallback>
          <Text className="text-title-1-emphasized">{initial}</Text>
        </AvatarFallback>
      </Avatar>
    </View>
  );
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
  const { firstName, lastName } = clerkNames(user);

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

      void queryClient.invalidateQueries({
        queryKey: useProfileQuery.getKey(),
      });
    },
  });

  const handleRetry = useCallback(() => {
    void refetchProfile();
  }, [refetchProfile]);

  const handleSubmit = useCallback(
    ({
      age,
      firstName: formFirstName,
      gender,
      height,
      lastName: formLastName,
      weight,
    }: ProfileFormValues) => {
      // The form is only rendered once the User and Profile have loaded.
      if (!user) {
        return;
      }

      // On the call, not the hook: a hook-level `onSuccess` would replace the
      // mutation's own, which shows the saved Profile.
      updateProfile(
        {
          age,
          firstName: formFirstName ?? firstName,
          gender,
          height,
          lastName: formLastName ?? lastName,
          measurementSystem,
          profile: profile ?? null,
          weight,
        },
        { onSuccess: () => router.back() }
      );
    },
    [firstName, lastName, measurementSystem, profile, updateProfile, user]
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: "minimal",
          headerShown: true,
          headerTitleStyle: {
            fontFamily: "NunitoSans-Bold",
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
            firstName,
            height: profile?.height ?? undefined,
            lastName,
            weight: profile?.weight ?? undefined,
          }}
          footer={
            !!error && (
              <ErrorMessage>{profileSaveErrorMessage(t, error)}</ErrorMessage>
            )
          }
          heading={
            <ProfilePhoto fullName={user.fullName} imageUrl={user.imageUrl} />
          }
          isSubmitting={isPending}
          layout="fields"
          measurementSystem={measurementSystem}
          onSubmit={handleSubmit}
          requireChange
          showNames
          submitLabel={t("editProfile.save")}
          submitTestID="edit-profile-save-button"
        />
      )}
    </>
  );
};

export default EditProfileScreen;
