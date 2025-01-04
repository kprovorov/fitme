import { api } from "@/lib/api";
import { Plan } from "@/lib/models";
import { createMutation } from "react-query-kit";

export type Gender = "male" | "female";
export type Goal = "lose_weight" | "gain_muscle" | "improve_health";
export type Location = "gym" | "home";

export type StoreProfileData = {
  gender: Gender;
  age: number;
  goal: Goal;
  weight: number;
  height: number;
  location: Location;
  frequency: number;
};

export const useStoreProfileMutation = createMutation<Plan, StoreProfileData>({
  mutationFn: async (data: StoreProfileData): Promise<Plan> => {
    const res = await api.post<Plan>("/api/profiles", data);

    return res.data;
  },
});
