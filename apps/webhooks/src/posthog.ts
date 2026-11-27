import { z } from "zod";

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

// Steps PostHog reports after the person is already gone, so a retry finds
// nothing to delete
const DONE_DESPITE_ERROR = new Set([
  "log_activity",
  "publish_clickhouse_tombstone",
]);

// The part of the bulk delete answer read here; everything else is ignored
const BulkDeleteAnswer = z.object({
  deletion_errors: z
    .array(
      z.object({ step: z.string().catch("unknown") }).catch({ step: "unknown" })
    )
    .optional(),
});

/**
 * The steps of a 2xx answer's `deletion_errors` that left a person undeleted.
 * PostHog reports a failed deletion there with a 202 rather than as an error
 * status, and it should be retried. An empty answer (no body) has none; one
 * that isn't the answer's JSON throws, so an unread answer never counts as
 * done.
 */
const retriableDeletionErrors = (text: string): string[] => {
  if (text === "") {
    return [];
  }

  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("PostHog person deletion failed: unreadable answer");
  }

  const answer = BulkDeleteAnswer.safeParse(json);

  if (!answer.success) {
    throw new Error("PostHog person deletion failed: unreadable answer");
  }

  const steps: string[] = [];

  for (const { step } of answer.data.deletion_errors ?? []) {
    if (!DONE_DESPITE_ERROR.has(step)) {
      steps.push(step);
    }
  }

  return steps;
};

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

    if (!response.ok) {
      // Nothing in a refusal is needed: dropping it frees the connection
      await response.body?.cancel();

      throw new Error(
        `PostHog person deletion failed: HTTP ${response.status}`
      );
    }

    const failedSteps = retriableDeletionErrors(await response.text());

    if (failedSteps.length > 0) {
      throw new Error(
        `PostHog person deletion failed at: ${failedSteps.join(", ")}`
      );
    }
  };
