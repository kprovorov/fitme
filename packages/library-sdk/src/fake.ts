import { type LibraryError, LibraryInvalidRequestError } from "./errors";
import type {
  Exercise,
  ExercisePage,
  ExerciseSummary,
  Library,
  ListExercisesParams,
} from "./types";

// The API's list rules (apps/exercises src/routes/exercises.ts), so the fake
// answers what the real client would.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH = 100;

export interface FakeLibrary extends Library {
  /** Every call fails with `error` from now on; `null` makes calls answer again. */
  failWith: (error: LibraryError | null) => void;
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
    throw new LibraryInvalidRequestError(
      `limit: must be an integer from 1 to ${MAX_LIMIT}`
    );
  }
  if (offset !== undefined && !(Number.isInteger(offset) && offset >= 0)) {
    throw new LibraryInvalidRequestError(
      "offset: must be a non-negative integer"
    );
  }
  if (search !== undefined && search.trim().length > MAX_SEARCH) {
    throw new LibraryInvalidRequestError(
      `search: at most ${MAX_SEARCH} characters`
    );
  }
};

/**
 * An in-memory Library for consumers' tests: the same answers as
 * the real client over the same Exercises (search, muscle group filter,
 * paging, lookup with `missing`, `get`), and it can be told to fail. An
 * Exercise given as a summary answers `get` with empty description and
 * instructions.
 */
export const createFakeLibrary = (
  exercises: readonly (Exercise | ExerciseSummary)[]
): FakeLibrary => {
  const full = new Map(
    exercises.map((exercise): [string, Exercise] => [
      exercise.slug,
      {
        description: "",
        instructions: "",
        ...exercise,
      },
    ])
  );
  const sorted = exercises
    .map(toSummary)
    .sort(
      (a, b) =>
        alphabetical.compare(a.name, b.name) ||
        alphabetical.compare(a.slug, b.slug)
    );
  const bySlug = new Map(sorted.map((summary) => [summary.slug, summary]));
  let failure: LibraryError | null = null;

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

    get: (slug) => orFail(() => full.get(slug) ?? null),

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
