import { createQuery } from "react-query-kit";
import { api, getToken } from "@/lib/api";
import { User } from "@/lib/models";
import Purchases from "react-native-purchases";
import * as Sentry from "@sentry/react-native";

export const useCurrentUserQuery = createQuery<User>({
  queryKey: ["user"],
  fetcher: async (): Promise<User> => {
    await getToken();

    const res = await api.get<User>("/api/user");

    const user = res.data;

    Sentry.setUser({
      id: user.id,
      username: user.email,
      email: user.email,
    });
    await Purchases.logIn(user.rc_user_id);

    return user;
  },
  retry: false,
});
