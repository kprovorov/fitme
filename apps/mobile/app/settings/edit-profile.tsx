import { useUser } from "@clerk/expo";
import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocales } from "expo-localization";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, View } from "react-native";
import ProfileForm, {
  PROFILE_SAVE_ERROR_MESSAGE,
  type ProfileFormValues,
} from "~/components/forms/profile-form";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { VStack } from "~/components/ui/vstack";
import { useUpdateProfileMutation } from "~/hooks/mutations/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { rateLimitedFor } from "~/lib/api/client";

const saveErrorMessage = (error: unknown) => {
  const waitSeconds = rateLimitedFor(error);
  return waitSeconds === null
    ? PROFILE_SAVE_ERROR_MESSAGE
    : `Couldn't save your profile. Too many requests: please try again in ${waitSeconds} s.`;
};

export default function EditProfileScreen() {
  const queryClient = useQueryClient();

  const { isLoaded: isUserLoaded, user } = useUser();
  const {
    data: profile,
    isPending: isProfilePending,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useProfileQuery();

  const isPendingLoad = !isUserLoaded || isProfilePending;
  const isLoadError = isProfileError;
  const name = user?.fullName ?? "";

  // Stored values are in the profile's system; the device locale only matters
  // when there is no profile yet.
  const locales = useLocales();
  const deviceMeasurementSystem = (locales[0]?.measurementSystem ??
    "metric") as MeasurementSystem;
  const measurementSystem: MeasurementSystem =
    profile?.measurement_system ?? deviceMeasurementSystem;

  const {
    mutate: updateProfile,
    isPending,
    error,
  } = useUpdateProfileMutation({
    onError: (e) => {
      // Too many requests is the User's to wait out, not a bug.
      if (rateLimitedFor(e) === null) {
        Sentry.captureException(e);
      }
    },
    // Also after a failure: the Profile may be saved even if the name is not,
    // or the answer was lost after the save. Clerk's user hook picks up the new name by itself.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: useProfileQuery.getKey() }),
    onSuccess: () => {
      router.back();
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
      updateProfile({
        age,
        gender,
        height,
        measurementSystem,
        name: formName ?? name,
        profile: profile ?? null,
        weight,
      });
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
          title: "Edit Profile",
        }}
      />
      {isPendingLoad && !isLoadError ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator colorClassName="accent-foreground" />
        </View>
      ) : null}
      {isLoadError ? (
        <VStack className="flex-1 items-stretch justify-center gap-4 p-6">
          <ErrorMessage className="text-center">
            Couldn't load your profile. Please check your connection and try
            again.
          </ErrorMessage>
          <Button label="Try Again" onPress={handleRetry} variant="secondary" />
        </VStack>
      ) : null}
      {!!user && profile !== undefined && (
        <ProfileForm
          defaultValues={{
            age: profile?.age ?? undefined,
            gender: profile?.gender,
            height: profile?.height ?? undefined,
            name,
            weight: profile?.weight ?? undefined,
          }}
          footer={
            !!error && <ErrorMessage>{saveErrorMessage(error)}</ErrorMessage>
          }
          isSubmitting={isPending}
          measurementSystem={measurementSystem}
          onSubmit={handleSubmit}
          showName
          submitLabel="Save"
          submitTestID="edit-profile-save-button"
        />
      )}
    </>
  );
}
