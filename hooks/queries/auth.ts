import { createQuery } from "react-query-kit";
import { api } from "@/lib/api";
import { User } from "@/lib/models";

export const useCurrentUserQuery = createQuery<User>({
  queryKey: ["user"],
  fetcher: async (): Promise<User> => {
    const res = await api.get<User>("/api/user");

    return res.data;
  },
  retry: false,
});
