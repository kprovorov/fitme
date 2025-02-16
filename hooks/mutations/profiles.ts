import { api } from "@/lib/api";
import { Gender, Profile } from "@/lib/models";
import { AxiosError } from "axios";
import { createMutation } from "react-query-kit";
import { ServerError } from "~/lib/api";

export type StoreProfileData = {
  gender: Gender;
  age: number;
  weight: number;
  height: number;
};

export const useStoreProfileMutation = createMutation<
  Profile,
  StoreProfileData,
  AxiosError<ServerError<StoreProfileData>>
>({
  mutationFn: async (data: StoreProfileData): Promise<Profile> => {
    const res = await api.post<Profile>("/api/profiles", data);

    return res.data;
  },
});
