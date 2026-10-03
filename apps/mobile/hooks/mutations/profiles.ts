import type { Gender, MeasurementSystem, Profile } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";

export interface StoreProfileData {
  age: number;
  gender: Gender;
  height: number;
  /** Measurement system the weight and height were entered in. */
  measurementSystem: MeasurementSystem;
  weight: number;
}

const getAuthUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }
  if (!user) {
    throw new Error("Not authenticated");
  }

  return user;
};

export const useStoreProfileMutation = createMutation<
  Profile,
  StoreProfileData
>({
  mutationFn: async ({
    measurementSystem,
    ...data
  }: StoreProfileData): Promise<Profile> => {
    const user = await getAuthUser();

    const { data: profile, error } = await supabase
      .from("profiles")
      .upsert(
        { ...data, measurement_system: measurementSystem, user_id: user.id },
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
    const user = await getAuthUser();

    let profile: Profile;

    const { data: updated, error: updateError } = await supabase
      .from("profiles")
      .update(data)
      .eq("user_id", user.id)
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
          user_id: user.id,
        })
        .select()
        .single();
      if (insertError) {
        throw insertError;
      }
      profile = inserted as unknown as Profile;
    }

    // The name lives in auth metadata, not in the profiles table
    const currentName =
      user.user_metadata?.name ?? user.user_metadata?.full_name;
    if (name !== currentName) {
      const { error: userError } = await supabase.auth.updateUser({
        data: { name },
      });
      if (userError) {
        throw userError;
      }
    }

    return profile;
  },
});
