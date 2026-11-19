import { createHash } from "node:crypto";

import {
  appLanguages,
  defaultAppLanguage,
  equipment as equipmentList,
} from "@fitme/core/models";
import type {
  AppLanguage,
  Difficulty,
  Equipment,
  MovementPattern,
  MuscleGroup,
} from "@fitme/core/models";

import type {
  BundleV2Exercise,
  BundleV2Media,
  LibraryBundleV2,
} from "./schema-v2";

/** The public Supabase Storage bucket the new Library's media is uploaded to. */
export const LIBRARY_MEDIA_BUCKET = "library";

const DEFAULT_LIMIT = 20;

/** `url` without its trailing slashes (a loop: a regex here backtracks on many slashes). */
const withoutTrailingSlashes = (url: string) => {
  let end = url.length;

  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }

  return url.slice(0, end);
};

/** An Exercise as a list answers it. */
export interface LibraryExerciseSummary {
  difficulty: Difficulty;
  /** In `@fitme/core`'s order, whatever order the bundle wrote it in. */
  equipment: Equipment[];
  movement_patterns: MovementPattern[];
  /** The primary ones. */
  muscle_groups: MuscleGroup[];
  name: string;
  secondary_muscle_groups: MuscleGroup[];
  slug: string;
  /** On the image render endpoint, so clients append `width`/`height`. */
  thumbnail_url: string;
  video_url: string;
}

/** An Exercise in full: its summary and its text, never its use cases or tags. */
export interface LibraryExercise extends LibraryExerciseSummary {
  benefits: string[];
  common_mistakes: string[];
  long_description: string;
  short_description: string;
  steps: string[];
}

/** A batch lookup's entry: the Exercise, and the slug it was asked for (an old one resolves to its replacement). */
export type LibraryLookupEntry = LibraryExerciseSummary & {
  requested_slug: string;
};

/** A slug a writer may store, and what it stands for. */
export interface KnownSlug {
  /** The Exercise's own slug: the replacement of an old one. */
  exercise_slug: string;
  /** The Exercise's primary muscle groups. */
  muscle_groups: MuscleGroup[];
  requested_slug: string;
}

export interface LibraryListOptions {
  /** Exercises needing any of it. */
  equipment?: readonly Equipment[];
  language?: AppLanguage;
  /** Default 20; below 1 counts as 1. */
  limit?: number;
  /** Exercises with any of them as a primary muscle group. */
  muscleGroups?: readonly MuscleGroup[];
  /** Default 0; below 0 counts as 0. */
  offset?: number;
  /** A case-insensitive substring of the name in `language`, the English name or an alias. */
  search?: string;
}

export interface LibraryPage {
  data: LibraryExerciseSummary[];
  hasMore: boolean;
  total: number;
}

interface LanguageOption {
  language?: AppLanguage;
}

/** The new Library's answers over one v2 bundle (ADR 0022). */
export interface InMemoryLibrary {
  /** Each slug once, in asked order: known (an old one through the map) or unknown. */
  checkSlugs: (slugs: readonly string[]) => {
    known: KnownSlug[];
    unknown: string[];
  };
  /** One Exercise in full, an old slug answering its replacement; `null` for none. */
  get: (slug: string, options?: LanguageOption) => LibraryExercise | null;
  /**
   * The sha256 of every answer in every language and of the slug map: an
   * `ETag` that changes whenever any answer can.
   */
  hash: string;
  list: (options?: LibraryListOptions) => LibraryPage;
  /** Each slug once, in asked order, an old one resolving to its replacement; the rest `missing`. */
  lookup: (
    slugs: readonly string[],
    options?: LanguageOption
  ) => { data: LibraryLookupEntry[]; missing: string[] };
}

interface ServedExercise {
  full: LibraryExercise;
  /** Lowercased: the served name, the English name and the aliases. */
  searchNames: string[];
  summary: LibraryExerciseSummary;
}

interface ServedLanguage {
  bySlug: Map<string, ServedExercise>;
  /** Sorted by name with the language's collation, ties by slug. */
  sorted: ServedExercise[];
}

const mediaPath = (slug: string, media: BundleV2Media) =>
  `${LIBRARY_MEDIA_BUCKET}/${slug}/${media.oid}.${media.extension}`;

const inCoreOrder = (needed: readonly Equipment[]) => {
  const set = new Set(needed);

  return equipmentList.filter((item) => set.has(item));
};

const unique = (values: readonly string[]) => [...new Set(values)];

/**
 * A frozen copy of `values`: every answer is shared by every later call, so
 * none may be changed by the caller it's handed to (nor alias the bundle).
 */
const frozen = <Value>(values: readonly Value[]): Value[] =>
  // SAFETY: frozen at runtime; typed mutable so answers fit the API schemas
  Object.freeze([...values]) as Value[];

/**
 * Builds the new Library from a validated v2 bundle, every language's answers
 * worked out once. Media URLs are on the Supabase project at `supabaseUrl`:
 * thumbnails through the image render endpoint, videos at their public object
 * URL, both in the `library` bucket.
 */
export const createInMemoryLibrary = (
  bundle: LibraryBundleV2,
  { supabaseUrl }: { supabaseUrl: string }
): InMemoryLibrary => {
  const storage = `${withoutTrailingSlashes(supabaseUrl)}/storage/v1`;
  const replacedSlugs = new Map(Object.entries(bundle.replaced_slugs ?? {}));

  const serve = (
    exercise: BundleV2Exercise,
    language: AppLanguage
  ): ServedExercise => {
    const english = exercise.locales.en;
    // an untranslated Exercise is served wholly in English, never field by field
    const text = exercise.locales[language] ?? english;

    const summary: LibraryExerciseSummary = Object.freeze({
      difficulty: exercise.difficulty,
      equipment: frozen(inCoreOrder(exercise.equipment)),
      movement_patterns: frozen(exercise.movement_patterns),
      muscle_groups: frozen(exercise.muscle_groups),
      name: text.name,
      secondary_muscle_groups: frozen(exercise.secondary_muscle_groups),
      slug: exercise.slug,
      thumbnail_url: `${storage}/render/image/public/${mediaPath(exercise.slug, exercise.thumbnail)}`,
      video_url: `${storage}/object/public/${mediaPath(exercise.slug, exercise.video)}`,
    });

    return {
      full: Object.freeze({
        ...summary,
        benefits: frozen(text.benefits),
        common_mistakes: frozen(text.common_mistakes),
        long_description: text.long_description,
        short_description: text.short_description,
        steps: frozen(text.steps),
      }),
      searchNames: unique(
        [text.name, english.name, ...exercise.aliases].map((name) =>
          name.toLowerCase()
        )
      ),
      summary,
    };
  };

  const serveIn = (language: AppLanguage): ServedLanguage => {
    const collator = new Intl.Collator(language);

    const sorted = bundle.exercises
      .map((exercise) => serve(exercise, language))
      .toSorted(
        (a, b) =>
          collator.compare(a.summary.name, b.summary.name) ||
          collator.compare(a.summary.slug, b.summary.slug)
      );

    return {
      bySlug: new Map(sorted.map((served) => [served.summary.slug, served])),
      sorted,
    };
  };

  // SAFETY: appLanguages contains every AppLanguage, each mapped by serveIn.
  const languages = Object.fromEntries(
    appLanguages.map((language) => [language, serveIn(language)])
  ) as Record<AppLanguage, ServedLanguage>;

  const find = (slug: string, language: AppLanguage = defaultAppLanguage) => {
    const { bySlug } = languages[language];

    return bySlug.get(replacedSlugs.get(slug) ?? slug);
  };

  return {
    checkSlugs: (slugs) => {
      const known: KnownSlug[] = [];
      const unknownSlugs: string[] = [];

      for (const slug of unique(slugs)) {
        const served = find(slug);

        if (served) {
          known.push({
            exercise_slug: served.summary.slug,
            muscle_groups: served.summary.muscle_groups,
            requested_slug: slug,
          });
        } else {
          unknownSlugs.push(slug);
        }
      }

      return { known, unknown: unknownSlugs };
    },
    get: (slug, { language } = {}) => find(slug, language)?.full ?? null,
    hash: createHash("sha256")
      .update(
        JSON.stringify({
          languages: appLanguages.map((language) =>
            languages[language].sorted.map(({ full }) => full)
          ),
          replacedSlugs: [...replacedSlugs].toSorted(([a], [b]) =>
            a < b ? -1 : 1
          ),
        })
      )
      .digest("hex"),
    list: ({
      equipment,
      language = defaultAppLanguage,
      limit = DEFAULT_LIMIT,
      muscleGroups,
      offset = 0,
      search,
    } = {}) => {
      const term = search?.trim().toLowerCase();

      const matches = languages[language].sorted.filter(
        ({ searchNames, summary }) =>
          (!term || searchNames.some((name) => name.includes(term))) &&
          (!muscleGroups?.length ||
            muscleGroups.some((group) =>
              summary.muscle_groups.includes(group)
            )) &&
          (!equipment?.length ||
            equipment.some((item) => summary.equipment.includes(item)))
      );

      // out-of-range paging never answers the tail or an endless empty page
      const start = Math.max(0, offset);

      const data = matches
        .slice(start, start + Math.max(1, limit))
        .map(({ summary }) => summary);

      return {
        data,
        hasMore: start + data.length < matches.length,
        total: matches.length,
      };
    },
    lookup: (slugs, { language } = {}) => {
      const data: LibraryLookupEntry[] = [];
      const missing: string[] = [];

      for (const slug of unique(slugs)) {
        const served = find(slug, language);

        if (served) {
          data.push({ ...served.summary, requested_slug: slug });
        } else {
          missing.push(slug);
        }
      }

      return { data, missing };
    },
  };
};
