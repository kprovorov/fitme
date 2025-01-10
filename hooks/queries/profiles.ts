import { api } from "@/lib/api";
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
    const res = await api.post<Profile>("/api/profiles", data);

    return res.data;
  },
});
