import { createMutation } from "react-query-kit";
import { supabase } from "@/lib/supabase";
import { getClerk } from "~/lib/clerk";
import { IS_E2E } from "~/lib/constants";
import { segmentClient } from "~/lib/segment";

export const useLogoutMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    await getClerk().signOut();
    if (!IS_E2E) {
      segmentClient.track("User Logged Out");
      segmentClient.reset();
    }
  },
});

export const useDeleteUserMutation = createMutation<void, void>({
  mutationFn: async (): Promise<void> => {
    const { error } = await supabase.functions.invoke("delete-user");
    if (error) {
      throw error;
    }
    await getClerk().signOut();
  },
});
