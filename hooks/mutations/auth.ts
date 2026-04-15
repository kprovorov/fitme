import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { IS_E2E } from "~/lib/constants";
import type { MeasurementSystem } from "~/lib/models";
import { segmentClient } from "~/lib/segment";

export interface LoginData {
  email: string;
  password: string;
}

export const useLoginMutation = createMutation<void, LoginData>({
  mutationFn: async (data: LoginData): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      throw error;
    }
    if (!IS_E2E) {
      segmentClient.track("User Logged In");
    }
  },
});

export const useLogoutMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    if (!IS_E2E) {
      segmentClient.track("User Logged Out");
      segmentClient.reset();
    }
  },
});

export interface RegisterData {
  email: string;
  measurement_system: MeasurementSystem;
  name: string;
  password: string;
}

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
    if (error) {
      throw error;
    }
    if (!IS_E2E) {
      segmentClient.track("User Registered");
    }
  },
});

export interface ForgotPasswordData {
  email: string;
}

export const useForgotPasswordMutation = createMutation<
  void,
  ForgotPasswordData
>({
  mutationFn: async (data: ForgotPasswordData): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${process.env.EXPO_PUBLIC_APP_URL}/auth/reset-password`,
    });
    if (error) {
      throw error;
    }
    if (!IS_E2E) {
      segmentClient.track("Password Reset Requested");
    }
  },
});

export interface ResetPasswordData {
  password: string;
}

export const useResetPasswordMutation = createMutation<void, ResetPasswordData>(
  {
    mutationFn: async (data: ResetPasswordData): Promise<void> => {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (error) {
        throw error;
      }
      if (!IS_E2E) {
        segmentClient.track("Password Reset Completed");
      }
    },
  }
);

export const useDeleteUserMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    const { error } = await supabase.functions.invoke("delete-user");
    if (error) {
      throw error;
    }
    await supabase.auth.signOut();
  },
});
