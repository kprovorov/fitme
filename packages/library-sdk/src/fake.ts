import {
  type AppLanguage,
  appLanguages,
  defaultAppLanguage,
  muscleGroups as knownMuscleGroups,
  type MuscleGroup,
} from "@fitme/core/models";
import { type LibraryError, LibraryInvalidRequestError } from "./errors";
import type {
  Exercise,
  ExercisePage,
  ExerciseSummary,
  Library,
  ListExercisesParams,
} from "./types";

// The API's list rules (apps/library src/routes/exercises.ts), so the fake
// answers what the real client would.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH = 100;

export interface FakeLibrary extends Library {
  /** Every call fails with `error` from now on; `null` makes calls answer again. */
  failWith: (error: LibraryError | null) => void;
}

/**
 * An Exercise's text in another App language. A description or instructions
 * left out answer empty, like an Exercise given as a summary.
 */
export interface FakeTranslation {
  description?: string;
  instructions?: string;
  name: string;
}

/** An Exercise for the fake, in English, with its translations, if any. */
export type FakeExercise = (Exercise | ExerciseSummary) & {
  translations?: Partial<Record<AppLanguage, FakeTranslation>>;
};

/** The fake's Library in one App language, the way `apps/library` serves it. */
interface FakeLanguage {
  bySlug: Map<string, ExerciseSummary>;
  full: Map<string, Exercise>;
  /** Each Exercise's lowercased served and English names, in `sorted` order. */
  searchNames: string[][];
  sorted: ExerciseSummary[];
}

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

const isMuscleGroup = (group: string): group is MuscleGroup =>
  (knownMuscleGroups as readonly string[]).includes(group);

/**
 * The muscle groups `muscleGroups` filters by, read as the API reads the
 * `muscle_groups` the client sends (joined with commas, so an empty list
 * isn't sent): `undefined` for none, the API's 400 for an unknown group, an
 * empty item or `muscleGroup` as well.
 */
const parseMuscleGroups = ({
  muscleGroup,
  muscleGroups,
}: ListExercisesParams): MuscleGroup[] | undefined => {
  if (!muscleGroups?.length) {
    return;
  }
  if (muscleGroup !== undefined) {
    throw new LibraryInvalidRequestError(
      "muscle_groups: can't be combined with muscle_group"
    );
  }
  const groups = muscleGroups.join(",").split(",");
  if (!groups.every(isMuscleGroup)) {
    throw new LibraryInvalidRequestError("muscle_groups: invalid muscle group");
  }
  return groups;
};

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
 * The Exercises in `language`: each one translated, or wholly English
 * without a translation (never field by field), sorted by that name with the
 * language's collation, ties by slug.
 */
const serveIn = (
  exercises: readonly FakeExercise[],
  language: AppLanguage
): FakeLanguage => {
  const collator = new Intl.Collator(language);
  const served = exercises
    .map(({ translations, ...english }) => {
      const translation = translations?.[language];
      const exercise: Exercise = {
        description: "",
        instructions: "",
        ...english,
        ...(translation && {
          description: translation.description ?? "",
          instructions: translation.instructions ?? "",
          name: translation.name,
        }),
      };
      const names = [exercise.name.toLowerCase(), english.name.toLowerCase()];
      return { exercise, searchNames: [...new Set(names)] };
    })
    .sort(
      (a, b) =>
        collator.compare(a.exercise.name, b.exercise.name) ||
        collator.compare(a.exercise.slug, b.exercise.slug)
    );
  const sorted = served.map(({ exercise }) => toSummary(exercise));
  return {
    bySlug: new Map(sorted.map((summary) => [summary.slug, summary])),
    full: new Map(served.map(({ exercise }) => [exercise.slug, exercise])),
    searchNames: served.map(({ searchNames }) => searchNames),
    sorted,
  };
};

/**
 * An in-memory Library for consumers' tests: the same answers as
 * the real client over the same Exercises (search, the muscle group filters,
 * paging, lookup with `missing`, `get`, each in the `language` asked for),
 * and it can be told to fail. An Exercise given as a summary answers `get`
 * with empty description and instructions. An Exercise can carry
 * `translations`: without one in the language asked for, it answers wholly
 * in English, and search matches its name in that language or its English
 * one, as the API does.
 */
export const createFakeLibrary = (
  exercises: readonly FakeExercise[]
): FakeLibrary => {
  const languages = Object.fromEntries(
    appLanguages.map((language) => [language, serveIn(exercises, language)])
  ) as Record<AppLanguage, FakeLanguage>;
  const inLanguage = (language: AppLanguage = defaultAppLanguage) =>
    languages[language];
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

    get: (slug, { language } = {}) =>
      orFail(() => inLanguage(language).full.get(slug) ?? null),

    list: (params = {}) =>
      orFail((): ExercisePage => {
        validate(params);
        const groups =
          parseMuscleGroups(params) ??
          (params.muscleGroup && [params.muscleGroup]);
        const { language, limit = DEFAULT_LIMIT, offset = 0, search } = params;
        const { searchNames, sorted } = inLanguage(language);
        const term = search?.trim().toLowerCase();
        const matches = sorted.filter(
          (summary, i) =>
            (!term || searchNames[i]?.some((name) => name.includes(term))) &&
            (!groups ||
              groups.some((group) => summary.muscle_groups.includes(group)))
        );
        const data = matches.slice(offset, offset + limit);
        return {
          data,
          hasMore: offset + data.length < matches.length,
          total: matches.length,
        };
      }),

    lookup: (slugs, { language } = {}) =>
      orFail(() => {
        const { bySlug } = inLanguage(language);
        const unique = [...new Set(slugs)];
        return {
          data: unique.flatMap((slug) => bySlug.get(slug) ?? []),
          missing: unique.filter((slug) => !bySlug.has(slug)),
        };
      }),
  };
};
