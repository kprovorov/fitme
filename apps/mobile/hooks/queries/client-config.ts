import { createQuery } from "react-query-kit";
import { z } from "zod";
import { getApiUrl } from "~/lib/constants";

const clientConfigSchema = z.object({
  /** Oldest supported app version per platform; `null` means no minimum. */
  minimumVersion: z.object({
    android: z.string().nullable(),
    ios: z.string().nullable(),
  }),
});

/** App-wide settings served by `GET /v1/client-config` in `apps/api`. */
export type ClientConfig = z.infer<typeof clientConfigSchema>;

const responseSchema = z.object({ data: clientConfigSchema });

export const useClientConfigQuery = createQuery<ClientConfig>({
  fetcher: async (_variables, { signal }): Promise<ClientConfig> => {
    const response = await fetch(`${getApiUrl()}/v1/client-config`, {
      signal,
    });
    if (!response.ok) {
      throw new Error(`Client config request failed (${response.status})`);
    }
    // A payload of another shape fails the query, so it can't block the app.
    return responseSchema.parse(await response.json()).data;
  },
  queryKey: ["client-config"],
  retry: false,
});
