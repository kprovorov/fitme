import { ApiError } from "@fitme/api-client";
import type { components } from "@fitme/api-client";
import { createQuery } from "react-query-kit";

import { isNotesEnabled } from "~/lib/feature-flags";
import { publicApi } from "~/lib/public-api";

/**
 * One of the User's Exercise notes as `GET /v1/exercise-notes` answers it:
 * `exercise_slug`, `note` and `updated_at`.
 */
export type ExerciseNote = components["schemas"]["ExerciseNote"];

/**
 * Every one of the User's Exercise notes through `GET /v1/exercise-notes`
 * (unpaged: bounded by the Library), shared by every screen showing one. Off
 * with the notes flag, so the app asks for none. Never retried (a 429 is the
 * User's to wait out); a failed refresh keeps the notes already read. Signing
 * out clears it with the rest of the cache.
 */
export const useExerciseNotesQuery = createQuery<ExerciseNote[]>({
  enabled: () => isNotesEnabled(),
  fetcher: async (): Promise<ExerciseNote[]> => {
    const { data } = await publicApi().GET("/v1/exercise-notes");

    if (!data) {
      throw new ApiError("Public API answered no Exercise notes");
    }

    return data.data;
  },
  queryKey: ["exercise-notes"],
  retry: false,
});

/** The note on the Exercise with this slug, or `null` for none. */
export const exerciseNoteOn = (
  notes: readonly ExerciseNote[],
  exerciseSlug: string
): string | null =>
  notes.find((row) => row.exercise_slug === exerciseSlug)?.note ?? null;
