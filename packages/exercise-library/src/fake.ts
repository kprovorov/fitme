import {
  type ExerciseLibraryError,
  ExerciseLibraryInvalidRequestError,
} from "./errors";
import type {
  ExerciseLibrary,
  ExercisePage,
  ExerciseSummary,
  ListExercisesParams,
} from "./types";

// The API's list rules (apps/exercises src/routes/exercises.ts), so the fake
// answers what the real client would.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH = 100;

export interface FakeExerciseLibrary extends ExerciseLibrary {
  /** Every call fails with `error` from now on; `null` makes calls answer again. */
  failWith: (error: ExerciseLibraryError | null) => void;
}

const alphabetical = new Intl.Collator("en");

/** Just the summary fields: an `Exercise`'s description and instructions dropped. */
const toSummary = ({
  muscle_groups,
  name,
  slug,
  thumbnail_url,
  video_url,
}: ExerciseSummary): ExerciseSummary => ({
  muscle_groups,
  name,
  slug,
  thumbnail_url,
  video_url,
});

const validate = ({ limit, offset, search }: ListExercisesParams) => {
  if (
    limit !== undefined &&
    !(Number.isInteger(limit) && limit >= 1 && limit <= MAX_LIMIT)
  ) {
    throw new ExerciseLibraryInvalidRequestError(
      `limit: must be an integer from 1 to ${MAX_LIMIT}`
    );
  }
  if (offset !== undefined && !(Number.isInteger(offset) && offset >= 0)) {
    throw new ExerciseLibraryInvalidRequestError(
      "offset: must be a non-negative integer"
    );
  }
  if (search !== undefined && search.trim().length > MAX_SEARCH) {
    throw new ExerciseLibraryInvalidRequestError(
      `search: at most ${MAX_SEARCH} characters`
    );
  }
};

/**
 * An in-memory Exercise Library for consumers' tests: the same answers as
 * the real client over the same Exercises (search, muscle group filter,
 * paging, lookup with `missing`), and it can be told to fail.
 */
export const createFakeExerciseLibrary = (
  exercises: readonly ExerciseSummary[]
): FakeExerciseLibrary => {
  const sorted = exercises
    .map(toSummary)
    .sort(
      (a, b) =>
        alphabetical.compare(a.name, b.name) ||
        alphabetical.compare(a.slug, b.slug)
    );
  const bySlug = new Map(sorted.map((summary) => [summary.slug, summary]));
  let failure: ExerciseLibraryError | null = null;

  const orFail = <T>(compute: () => T): Promise<T> => {
    if (failure) {
      return Promise.reject(failure);
    }
    try {
      return Promise.resolve(compute());
    } catch (error) {
      return Promise.reject(error);
    }
  };

  return {
    failWith: (error) => {
      failure = error;
    },

    list: (params = {}) =>
      orFail((): ExercisePage => {
        validate(params);
        const {
          limit = DEFAULT_LIMIT,
          muscleGroup,
          offset = 0,
          search,
        } = params;
        const term = search?.trim().toLowerCase();
        const matches = sorted.filter(
          (summary) =>
            (!term || summary.name.toLowerCase().includes(term)) &&
            (!muscleGroup || summary.muscle_groups.includes(muscleGroup))
        );
        const data = matches.slice(offset, offset + limit);
        return {
          data,
          hasMore: offset + data.length < matches.length,
          total: matches.length,
        };
      }),

    lookup: (slugs) =>
      orFail(() => {
        const unique = [...new Set(slugs)];
        return {
          data: unique.flatMap((slug) => bySlug.get(slug) ?? []),
          missing: unique.filter((slug) => !bySlug.has(slug)),
        };
      }),
  };
};
