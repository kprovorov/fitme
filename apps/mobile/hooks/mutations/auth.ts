import type { MeasurementSystem } from "@fitme/core";
import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { getClerk } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

// Registration and password reset move to Clerk in their own changes; until
// then they fail with this message instead of calling Supabase Auth.
const notAvailableYet = (): Promise<void> =>
  Promise.reject(
    new Error("This isn't available yet. Please try again later.")
  );

export const useLogoutMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    await getClerk().signOut();
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
  mutationFn: (_data: RegisterData): Promise<void> => notAvailableYet(),
});

export interface ForgotPasswordData {
  email: string;
}

export const useForgotPasswordMutation = createMutation<
  void,
  ForgotPasswordData
>({
  mutationFn: (_data: ForgotPasswordData): Promise<void> => notAvailableYet(),
});

export interface ResetPasswordData {
  password: string;
}

export const useResetPasswordMutation = createMutation<void, ResetPasswordData>(
  {
    mutationFn: (_data: ResetPasswordData): Promise<void> => notAvailableYet(),
  }
);

export const useDeleteUserMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    const { error } = await supabase.functions.invoke("delete-user");
    if (error) {
      throw error;
    }
    await getClerk().signOut();
  },
});
