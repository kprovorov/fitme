import { createQuery } from "react-query-kit";
import { getApiUrl } from "~/lib/constants";

/** App-wide settings served by `GET /v1/client-config` in `apps/api`. */
export interface ClientConfig {
  /** Oldest supported app version per platform; `null` means no minimum. */
  minimumVersion: { android: string | null; ios: string | null };
}

export const useClientConfigQuery = createQuery<ClientConfig>({
  fetcher: async (_variables, { signal }): Promise<ClientConfig> => {
    const response = await fetch(`${getApiUrl()}/v1/client-config`, {
      signal,
    });
    if (!response.ok) {
      throw new Error(`Client config request failed (${response.status})`);
    }
    const { data } = (await response.json()) as { data: ClientConfig };
    return data;
  },
  queryKey: ["client-config"],
  retry: false,
});
