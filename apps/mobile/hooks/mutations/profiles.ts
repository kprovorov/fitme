import {
  type Gender,
  type MeasurementSystem,
  type Profile,
  splitName,
} from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { getClerk, getCurrentUserId } from "~/lib/clerk";
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

export interface UpdateProfileData extends StoreProfileData {
  name: string;
}

export const useUpdateProfileMutation = createMutation<
  Profile,
  UpdateProfileData
>({
  mutationFn: async ({
    measurementSystem,
    name,
    ...data
  }: UpdateProfileData): Promise<Profile> => {
    const userId = getCurrentUserId();

    let profile: Profile;

    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update(data)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (updateError) {
      throw updateError;
    }

    if (updated) {
      profile = updated as unknown as Profile;
    } else {
      // No profile yet (onboarding was skipped), so create one. An existing
      // profile's system only changes through the `convert_measurement_system` RPC.
      const { data: inserted, error: insertError } = await supabase
        .from("profiles")
        .insert({
          ...data,
          measurement_system: measurementSystem,
          user_id: userId,
        })
        .select()
        .single();
      if (insertError) {
        throw insertError;
      }
      profile = inserted as unknown as Profile;
    }

    // The name lives in Clerk, not in the profiles table
    const { user } = getClerk();
    if (user && name !== (user.fullName ?? "")) {
      await user.update(splitFullName(name));
    }

    return profile;
  },
});
