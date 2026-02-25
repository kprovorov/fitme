import { supabase } from "@/lib/supabase";
import { MeasurementSystem } from "~/lib/models";
import { createMutation } from "react-query-kit";

export type LoginData = {
  email: string;
  password: string;
};

export const useLoginMutation = createMutation<void, LoginData>({
  mutationFn: async (data: LoginData): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) throw error;
  },
});

export const useLogoutMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
});

export type RegisterData = {
  name: string;
  email: string;
  password: string;
  measurement_system: MeasurementSystem;
};

export const useRegisterMutation = createMutation<void, RegisterData>({
  mutationFn: async (data: RegisterData): Promise<void> => {
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          name: data.name,
          measurement_system: data.measurement_system,
        },
      },
    });
    if (error) throw error;
  },
});

export const useDeleteUserMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    const { error } = await supabase.functions.invoke("delete-user");
    if (error) throw error;
    await supabase.auth.signOut();
  },
});
