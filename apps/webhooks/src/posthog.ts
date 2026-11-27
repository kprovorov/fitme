interface PosthogPersonDeleterOptions {
  /** A personal API key with `person:write` (`POSTHOG_PERSONAL_API_KEY`). */
  apiKey?: string | undefined;
  fetch?: typeof fetch;
  /** The PostHog project's id (`POSTHOG_PROJECT_ID`). */
  projectId?: string | undefined;
}

/**
 * The PostHog key and project id from `env`: `POSTHOG_PERSONAL_API_KEY` and
 * `POSTHOG_PROJECT_ID`.
 */
export const posthogConfig = (
  env: Record<string, string | undefined>
): Pick<PosthogPersonDeleterOptions, "apiKey" | "projectId"> => ({
  apiKey: env.POSTHOG_PERSONAL_API_KEY,
  projectId: env.POSTHOG_PROJECT_ID,
});

// The project lives on US Cloud (ADR 0026): the host is fixed
const POSTHOG_HOST = "https://us.posthog.com";
const DELETE_TIMEOUT_MS = 20_000;

/**
 * Deletes a User's person and their events in PostHog through its person
 * deletion API (`POST /api/projects/:id/persons/bulk_delete/`), the User id
 * being the person's one distinct id. PostHog answers 202 and deletes in the
 * background; a distinct id it doesn't have is queued as nothing, so a
 * repeat is harmless. Any other answer, a network failure or a missing key
 * or project id throws, so account deletion never skips PostHog. The key
 * never goes into an error.
 */
export const posthogPersonDeleter =
  ({
    apiKey,
    fetch = globalThis.fetch,
    projectId,
  }: PosthogPersonDeleterOptions) =>
  async (userId: string): Promise<void> => {
    if (!apiKey) {
      throw new Error("Missing POSTHOG_PERSONAL_API_KEY environment variable");
    }

    if (!projectId) {
      throw new Error("Missing POSTHOG_PROJECT_ID environment variable");
    }

    const url = new URL(
      `/api/projects/${encodeURIComponent(projectId)}/persons/bulk_delete/`,
      POSTHOG_HOST
    );

    const response = await fetch(url, {
      body: JSON.stringify({ delete_events: true, distinct_ids: [userId] }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(DELETE_TIMEOUT_MS),
    });

    // Nothing in the answer is needed: dropping it frees the connection
    await response.body?.cancel();

    if (!response.ok) {
      throw new Error(
        `PostHog person deletion failed: HTTP ${response.status}`
      );
    }
  };
