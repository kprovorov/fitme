import { ApiError } from "@fitme/api-client";
import type { components } from "@fitme/api-client";
import { createMutation } from "react-query-kit";

import { useExerciseNotesQuery } from "~/hooks/queries/exercise-notes";
import type { ExerciseNote } from "~/hooks/queries/exercise-notes";
import { analytics } from "~/lib/analytics";
import { publicApi } from "~/lib/public-api";
import {
  isStillWriteStarter,
  rememberWriteStarter,
  seedWriteAnswer,
} from "~/lib/write-answers";
import type { WriteStarter } from "~/lib/write-answers";

/** What `PUT /v1/exercise-notes/{slug}` answers: `note` is `null` once cleared. */
export type SavedExerciseNote = components["schemas"]["SavedExerciseNote"];

export interface SaveExerciseNoteData {
  /** The Exercise's own slug (an old one is saved under its replacement). */
  exerciseSlug: string;
  /** The whole text as the User left it; blank clears the note. */
  note: string;
}

/**
 * The notes list with the saved note in place of the one on its Exercise, or
 * without it once cleared, in the API's order (by slug).
 */
export const withSavedNote = (
  notes: readonly ExerciseNote[],
  saved: SavedExerciseNote
): ExerciseNote[] => {
  const others = notes.filter(
    (row) => row.exercise_slug !== saved.exercise_slug
  );

  if (saved.note === null || saved.updated_at === null) {
    return others;
  }

  return [
    ...others,
    {
      exercise_slug: saved.exercise_slug,
      note: saved.note,
      updated_at: saved.updated_at,
    },
  ].toSorted((a, b) => a.exercise_slug.localeCompare(b.exercise_slug));
};

const saveExerciseNote = async ({
  exerciseSlug,
  note,
}: SaveExerciseNoteData): Promise<SavedExerciseNote> => {
  const { data } = await publicApi().PUT("/v1/exercise-notes/{slug}", {
    body: { note },
    params: { path: { slug: exerciseSlug } },
  });

  if (!data) {
    throw new ApiError("Public API answered no Exercise note");
  }

  return data.data;
};

/**
 * Saves the User's note on an Exercise through `PUT /v1/exercise-notes/{slug}`
 * (no expected note: the last save wins). The answer shows in the notes list
 * by the write-answer rules (`seedWriteAnswer`): as is while the list still
 * shows what it showed when the save started, read again otherwise, and
 * nothing at all once another User is signed in. A list never read can't take
 * one note as the whole list, so it's read instead. `Note Saved` or
 * `Note Cleared` goes out once the API has answered, with the target only,
 * never the text. Seeded in the mutation's own `onMutate` and `onSuccess` (a
 * hook-level one would replace them), so a screen passes its own to `mutate`.
 */
export const useSaveExerciseNoteMutation = createMutation<
  SavedExerciseNote,
  SaveExerciseNoteData,
  Error,
  WriteStarter
>({
  mutationFn: saveExerciseNote,
  onMutate: (_variables, { client }) =>
    rememberWriteStarter(client, [useExerciseNotesQuery.getKey()]),
  onSuccess: async (saved, _variables, starter, { client }) => {
    if (!isStillWriteStarter(starter)) {
      return;
    }

    const queryKey = useExerciseNotesQuery.getKey();
    const shown = client.getQueryData<ExerciseNote[]>(queryKey);

    await (shown === undefined
      ? client.invalidateQueries({ exact: true, queryKey })
      : seedWriteAnswer(client, starter, {
          answer: withSavedNote(shown, saved),
          queryKey,
        }));

    if (isStillWriteStarter(starter)) {
      await analytics.send(
        saved.note === null ? "Note Cleared" : "Note Saved",
        {
          target: "exercise",
        }
      );
    }
  },
});
