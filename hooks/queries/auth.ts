import { createQuery } from "react-query-kit";
import { api } from "@/lib/api";
import { User } from "@/lib/models";

export const useCurrentUserQuery = createQuery<User>({
  queryKey: ["api/user"],
  fetcher: async (): Promise<User> => {
    const res = await api.get<User>("/api/user");

    return res.data;
  },
});
