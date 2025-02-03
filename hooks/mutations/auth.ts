import { createMutation } from "react-query-kit";
import { api, deleteToken, ServerError, setToken } from "@/lib/api";
import { AxiosError } from "axios";

export type LoginData = {
  email: string;
  password: string;
};

export const useLoginMutation = createMutation<
  string,
  LoginData,
  AxiosError<ServerError<LoginData>>
>({
  mutationFn: async (data: LoginData): Promise<string> => {
    const res = await api.post<string>("/api/sanctum/token", {
      ...data,
      device_name: "mobile",
    });

    await setToken(res.data);

    return res.data;
  },
});

export const useLogoutMutation = createMutation<void, void, AxiosError<void>>({
  mutationFn: async () => {
    await api.post("/api/auth/logout");
    await deleteToken();
  },
});

export type RegisterData = {
  name: string;
  email: string;
  password: string;
};

export const useRegisterMutation = createMutation<
  void,
  RegisterData,
  AxiosError<ServerError<RegisterData>>
>({
  mutationFn: async (data: RegisterData): Promise<void> => {
    await api.post<void>("/api/auth/register", {
      ...data,
      password_confirmation: data.password,
    });
  },
});

export const useDeleteUserMutation = createMutation<
  void,
  void,
  AxiosError<ServerError<void>>
>({
  mutationFn: async () => {
    await api.delete("/api/user");

    await deleteToken();
  },
});
