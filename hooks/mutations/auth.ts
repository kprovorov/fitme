import { createMutation } from "react-query-kit";
import { api } from "@/lib/api";
import * as SecureStore from "expo-secure-store";

export type LoginData = {
  email: string;
  password: string;
};

export const useLoginMutation = createMutation<string, LoginData>({
  mutationFn: async (data: LoginData): Promise<string> => {
    const res = await api.post<string>("/api/sanctum/token", {
      ...data,
      device_name: "mobile",
    });

    await SecureStore.setItemAsync("token", res.data);

    api.defaults.headers.common["Authorization"] = `Bearer ${res.data}`;

    return res.data;
  },
});

export type RegisterData = {
  name: string;
  email: string;
  password: string;
};

export const useRegisterMutation = createMutation({
  mutationFn: async (data: RegisterData) => {
    const res = await api.post("/register", {
      ...data,
      password_confirmation: data.password,
    });

    return res.data;
  },
});
