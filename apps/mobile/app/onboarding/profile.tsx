import { useUser } from "@clerk/expo";
import type { MeasurementSystem } from "@fitme/core";
import * as Sentry from "@sentry/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useLocales } from "expo-localization";
import { router } from "expo-router";
import { useCallback } from "react";
import ProfileForm, {
  PROFILE_SAVE_ERROR_MESSAGE,
  type ProfileFormValues,
} from "~/components/forms/profile-form";
import { ErrorMessage } from "~/components/ui/error-message";
import { Text } from "~/components/ui/text";
import { H2 } from "~/components/ui/typography";
import { VStack } from "~/components/ui/vstack";
import { useStoreProfileMutation } from "~/hooks/mutations/profiles";
import { useProfileQuery } from "~/hooks/queries/profiles";
import { IS_E2E } from "~/lib/constants";
import { storage } from "~/lib/mmkv";
import { segmentClient } from "~/lib/segment";

export default function ProfileScreen() {
  const queryClient = useQueryClient();

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
      Sentry.captureException(e);
    },
    onSuccess: (savedProfile, variables) => {
      // Edit Profile seeds its form from the cached Profile, so put the saved
      // Profile there right away and refetch to be safe.
      queryClient.setQueryData(useProfileQuery.getKey(), savedProfile);
      queryClient.invalidateQueries({ queryKey: useProfileQuery.getKey() });
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

  const handleSubmit = useCallback(
    ({ age, gender, height, weight }: ProfileFormValues) =>
      storeProfile({ age, gender, height, measurementSystem, weight }),
    [measurementSystem, storeProfile]
  );

  return (
    !!user &&
    !isProfilePending && (
      <ProfileForm
        defaultValues={{
          age: profile?.age ?? undefined,
          gender: profile?.gender,
          height: profile?.height ?? undefined,
          weight: profile?.weight ?? undefined,
        }}
        footer={
          !!error && <ErrorMessage>{PROFILE_SAVE_ERROR_MESSAGE}</ErrorMessage>
        }
        heading={
          <VStack className="gap-2">
            <H2>Let's get to know you!</H2>
            <Text className="text-center">
              We'll use this information to personalize your experience.
            </Text>
          </VStack>
        }
        isSubmitting={isPending}
        measurementSystem={measurementSystem}
        onSubmit={handleSubmit}
        submitLabel="Next"
        submitSystemImage="arrow.right"
      />
    )
  );
}
