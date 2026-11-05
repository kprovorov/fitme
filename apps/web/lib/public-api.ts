import { createPublicApi } from "@fitme/api-client";
import type { PublicApi, PublicApiFetch } from "@fitme/api-client";

import { publicApiUrl } from "~/lib/env";

export interface PublicApiForOptions {
  /** Defaults to `PUBLIC_API_URL`; an empty string stands for it being unset. */
  apiUrl?: string;
  /** Defaults to the global `fetch`; the seam a test's stub answers through. */
  fetch?: PublicApiFetch;
  /**
   * The caller's Clerk session token. Resolve `auth()` before calling, never
   * inside this getter: the client turns anything it throws into an
   * `ApiError`, which would swallow Next's dynamic-rendering bailout.
   */
  getToken: () => Promise<string | null>;
}

/**
 * `apps/api` at `PUBLIC_API_URL` as the request's Clerk User, for every read
 * of their data (ADR 0011). The URL is server-only (no `NEXT_PUBLIC_`): only
 * Server Components call it. Throws an `ApiError` when the URL is unset, so
 * no read falls back to another path, and the client, `ApiError` and the
 * generated `/v1` types all come from `@fitme/api-client`, shared with the
 * mobile app.
 */
export const publicApi = ({
  apiUrl,
  fetch,
  getToken,
}: PublicApiForOptions): PublicApi =>
  createPublicApi({
    baseUrl: () => apiUrl ?? publicApiUrl(),
    fetch,
    token: getToken,
  })();
