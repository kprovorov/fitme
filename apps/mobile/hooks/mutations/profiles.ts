import type { Gender, MeasurementSystem, Profile } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { ApiError } from "~/lib/api/client";
import { getClerk, getCurrentUserId } from "~/lib/clerk";
import { publicApi } from "~/lib/public-api";
import { splitFullName } from "~/lib/user-name";

export interface StoreProfileData {
  age: number;
  gender: Gender;
  height: number;
  /** Measurement system the weight and height were entered in. */
  measurementSystem: MeasurementSystem;
  weight: number;
}

export const useStoreProfileMutation = createMutation<
  Profile,
  StoreProfileData
>({
  mutationFn: async ({
    measurementSystem,
    ...data
  }: StoreProfileData): Promise<Profile> => {
    const userId = getCurrentUserId();

    const { data: profile, error } = await supabase
      .from("profiles")
      .upsert(
        { ...data, measurement_system: measurementSystem, user_id: userId },
        { onConflict: "user_id" }
      )
      .select()
      .single();
    if (error) {
      throw error;
    }

    return profile as unknown as Profile;
  },
});

const EDITABLE_FIELDS = ["age", "gender", "height", "weight"] as const;

/** The Profile fields edit-profile changes. */
type EditableFields = Pick<StoreProfileData, (typeof EDITABLE_FIELDS)[number]>;

export type ProfileChanges = Partial<EditableFields>;

/**
 * The fields of `values` that differ from the saved `profile`: every field
 * without one. Unchanged fields are never sent, so a value saved before
 * today's bounds doesn't fail an unrelated edit.
 */
export const profileChanges = (
  profile: Profile | null,
  values: EditableFields
): ProfileChanges => {
  const changes: ProfileChanges = {};
  for (const field of EDITABLE_FIELDS) {
    if (profile?.[field] !== values[field]) {
      Object.assign(changes, { [field]: values[field] });
    }
  }
  return changes;
};

export interface UpdateProfileData extends StoreProfileData {
  name: string;
  /** The saved Profile the form started from, or `null` without one. */
  profile: Profile | null;
}

/**
 * Saves edit-profile: the changed fields through `PATCH /v1/profile` (no
 * request when nothing changed), and the name to Clerk. Without a Profile
 * (onboarding was skipped) the API answers `profile_not_found` and the
 * Profile is created through Supabase, until the API can create one; any
 * other failure rejects with its `ApiError`. Nothing from the answer is kept:
 * the caller reads the Profile again.
 */
export const useUpdateProfileMutation = createMutation<void, UpdateProfileData>(
  {
    mutationFn: async ({
      measurementSystem,
      name,
      profile,
      ...values
    }: UpdateProfileData): Promise<void> => {
      const changes = profileChanges(profile, values);

      if (Object.keys(changes).length > 0) {
        try {
          await publicApi().PATCH("/v1/profile", { body: changes });
        } catch (error) {
          if (
            !(error instanceof ApiError && error.code === "profile_not_found")
          ) {
            throw error;
          }
          const { error: insertError } = await supabase
            .from("profiles")
            .insert({
              ...values,
              measurement_system: measurementSystem,
              user_id: getCurrentUserId(),
            });
          if (insertError) {
            throw insertError;
          }
        }
      }

      // The name lives in Clerk, not in the profiles table
      const { user } = getClerk();
      if (user && name !== (user.fullName ?? "")) {
        await user.update(splitFullName(name));
      }
    },
  }
);
