import { supabase } from "@/lib/supabase";
import { Gender, Profile } from "@/lib/models";
import { createMutation } from "react-query-kit";

export type StoreProfileData = {
  gender: Gender;
  age: number;
  weight: number;
  height: number;
};

export const useStoreProfileMutation = createMutation<
  Profile,
  StoreProfileData
>({
  mutationFn: async (data: StoreProfileData): Promise<Profile> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: profile, error } = await supabase
      .from("profiles")
      .insert({ ...data, user_id: user!.id })
      .select()
      .single();
    if (error) throw error;

    return profile as unknown as Profile;
  },
});
