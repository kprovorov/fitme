import type { Gender, MeasurementSystem, Profile } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";

export interface StoreProfileData {
  age: number;
  gender: Gender;
  height: number;
  weight: number;
}

export const useStoreProfileMutation = createMutation<
  Profile,
  StoreProfileData
>({
  mutationFn: async (data: StoreProfileData): Promise<Profile> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const measurement_system =
      (user.user_metadata?.measurement_system as MeasurementSystem) ?? "metric";

    const { data: profile, error } = await supabase
      .from("profiles")
      .upsert(
        { ...data, measurement_system, user_id: user.id },
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
