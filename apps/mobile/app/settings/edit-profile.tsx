import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocales } from "expo-localization";
import { router, Stack } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";
import ProfileForm, {
  PROFILE_SAVE_ERROR_MESSAGE,
  type ProfileFormValues,
} from "~/components/forms/profile-form";
import { Button } from "~/components/ui/button";
import { ErrorMessage } from "~/components/ui/error-message";
import { Spinner } from "~/components/ui/spinner";
import { VStack } from "~/components/ui/vstack";
import { useUpdateProfileMutation } from "~/hooks/mutations/profiles";
import { useCurrentUserQuery } from "~/hooks/queries/auth";

export default function EditProfileScreen() {
  const queryClient = useQueryClient();

  const {
    data: user,
    isPending: isUserPending,
    isError: isUserError,
    refetch: refetchUser,
  } = useCurrentUserQuery();

  // Stored values are in the profile's system; the device locale only matters
  // when there is no profile yet.
  const locales = useLocales();
  const deviceMeasurementSystem = (locales[0]?.measurementSystem ??
    "metric") as MeasurementSystem;
  const measurementSystem: MeasurementSystem =
    user?.profile?.measurement_system ?? deviceMeasurementSystem;

  const {
    mutate: updateProfile,
    isPending,
    error,
  } = useUpdateProfileMutation({
    onError: (e) => {
      Sentry.captureException(e);
    },
    // Also after a failure: the profile row may be saved even if the name is not
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["user"] }),
    onSuccess: () => {
      router.back();
    },
  });

  const handleRetry = useCallback(() => {
    refetchUser();
  }, [refetchUser]);

  const handleSubmit = useCallback(
    ({ age, gender, height, name, weight }: ProfileFormValues) => {
      // The form is only rendered once the user has loaded.
      if (!user) {
        return;
      }
      updateProfile({
        age,
        gender,
        height,
        measurementSystem,
        name: name ?? user.name,
        weight,
      });
    },
    [measurementSystem, updateProfile, user]
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
      {isUserPending ? (
        <View className="flex-1 items-center justify-center">
          <Spinner className="text-foreground" size={32} />
        </View>
      ) : null}
      {isUserError ? (
        <VStack className="flex-1 items-stretch justify-center gap-4 p-6">
          <ErrorMessage className="text-center">
            Couldn't load your profile. Please check your connection and try
            again.
          </ErrorMessage>
          <Button label="Try Again" onPress={handleRetry} variant="secondary" />
        </VStack>
      ) : null}
      {!!user && (
        <ProfileForm
          defaultValues={{
            age: user.profile?.age ?? undefined,
            gender: user.profile?.gender,
            height: user.profile?.height ?? undefined,
            name: user.name,
            weight: user.profile?.weight ?? undefined,
          }}
          footer={
            !!error && <ErrorMessage>{PROFILE_SAVE_ERROR_MESSAGE}</ErrorMessage>
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
