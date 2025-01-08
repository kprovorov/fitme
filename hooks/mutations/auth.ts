import { createMutation } from "react-query-kit";
import { api, setToken } from "@/lib/api";
import { User } from "~/lib/models";

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

    await setToken(res.data);

    return res.data;
  },
});

export type RegisterData = {
  name: string;
  email: string;
  password: string;
};

export const useRegisterMutation = createMutation<string, RegisterData>({
  mutationFn: async (data: RegisterData): Promise<string> => {
    await api.post<User>("/api/auth/register", {
      ...data,
      password_confirmation: data.password,
    });

    const res = await api.post<string>("/api/sanctum/token", {
      ...data,
      device_name: "mobile",
    });

    await setToken(res.data);

    return res.data;
  },
});
